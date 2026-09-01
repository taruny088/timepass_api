"""Conversations: starting one, and listing the ones you are in.

THE RULE THAT MATTERS MOST IN THIS PHASE, stated once here and enforced in
every endpoint that touches a conversation:

    A person may only read a conversation they are part of, and that is checked
    on the server, on every request.

Not by hiding a link. Not by the frontend only asking for its own. PLAN2.md is
blunt about why: a post deleted by the wrong person is a bug, a private message
shown to a stranger is a serious failure.

WHO MAY START A CHAT. Anybody, with anybody. PLAN2.md originally said "two
people who follow each other"; open messaging was chosen deliberately in its
place. What that gives up is the thing the follow rule was quietly doing --
keeping strangers out of your inbox. Instagram solves that with a message
requests folder rather than by refusing the message, and if this ever needs
tightening, that is one extra column on `conversations` and a filter on the
list. No table gets rebuilt. See the Conversation class in models.py.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import Conversation, Message, User
from app.schemas import ChatMessageOut, ConversationCreate, ConversationOut
from app.users import get_user_by_username

router = APIRouter(prefix="/conversations", tags=["conversations"])

DEFAULT_LIMIT = 20
MAX_LIMIT = 50


def ordered_pair(one_id: int, other_id: int) -> tuple[int, int]:
    """The two ids with the smaller one first.

    THE SINGLE MOST IMPORTANT FUNCTION IN THIS FILE, despite being one line.

    Every read and every write of `conversations` goes through it, so the pair
    is stored and looked up the same way round every time. Without that, you
    messaging me creates (you, me) and me messaging you fails to find it and
    creates (me, you) -- two threads for two people, each holding half the
    conversation, with nothing on screen looking wrong.

    It exists as a named function rather than min() and max() written inline at
    each call site because inline is where the fourth copy gets it backwards.
    """
    return min(one_id, other_id), max(one_id, other_id)


def get_conversation_or_404(
    db: Session, conversation_id: int, current_user: User
) -> Conversation:
    """Fetch a conversation, or refuse -- and refuse the same way in both cases.

    Every endpoint that touches one starts here, which is the point: the
    permission check cannot be forgotten if there is no other way to get hold
    of a conversation.

    404 FOR "NOT YOURS", NOT 403, and this is a real decision rather than
    laziness. 403 means "this exists and you may not have it", which confirms
    that conversation 12 exists and, with a little patience, that two
    particular people are talking to each other. 404 says only "there is
    nothing here for you". Same reasoning as the identical reply from
    forgot-password in Phase 13: the helpful-feeling answer is the one that
    leaks.
    """
    conversation = db.get(Conversation, conversation_id)

    # Written as one condition on purpose. Two separate ifs, one for missing and
    # one for not-yours, invites somebody to later give them different messages
    # -- which is exactly the leak this is avoiding.
    if conversation is None or current_user.id not in (
        conversation.user_a_id,
        conversation.user_b_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    return conversation


@router.post(
    "",
    response_model=ConversationOut,
    summary="Start a conversation with somebody, or open the existing one",
)
def start_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationOut:
    """Find the conversation with this person, creating it only if there is none.

    NOT REALLY "CREATE". Pressing Message on a profile has to work whether or
    not you have talked before, and the browser cannot know which. So this
    endpoint answers "give me our conversation" and quietly creates one the
    first time.

    That makes it IDEMPOTENT: calling it five times leaves one conversation and
    returns the same one each time. Worth the word -- an idempotent endpoint is
    one where doing it again changes nothing, which is what makes it safe to
    retry on a bad connection.
    """
    other = get_user_by_username(db, payload.username)

    # Checked here as well as in the database, so the user gets a sentence
    # instead of a 500 from a constraint they cannot see. The database rule
    # (user_a_id < user_b_id, which equal ids fail) is the one that actually
    # holds; this one is manners.
    if other.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot message yourself.",
        )

    user_a_id, user_b_id = ordered_pair(current_user.id, other.id)

    conversation = db.scalars(
        select(Conversation).where(
            Conversation.user_a_id == user_a_id,
            Conversation.user_b_id == user_b_id,
        )
    ).first()

    if conversation is None:
        conversation = Conversation(user_a_id=user_a_id, user_b_id=user_b_id)
        db.add(conversation)

        try:
            db.commit()
        except IntegrityError:
            # BOTH PEOPLE PRESSED MESSAGE AT THE SAME MOMENT.
            #
            # The look-up above happens at one instant. Two requests can both
            # look, both find nothing, and both try to insert. The unique rule
            # in PostgreSQL refuses the second, and it lands here.
            #
            # This is not an error to report -- the conversation the caller
            # asked for now exists, it was just made by the other request a
            # millisecond ago. So roll back the failed insert and read theirs.
            db.rollback()
            conversation = db.scalars(
                select(Conversation).where(
                    Conversation.user_a_id == user_a_id,
                    Conversation.user_b_id == user_b_id,
                )
            ).first()

            if conversation is None:
                # Something else refused the write, so do not pretend to
                # understand it.
                raise

        db.refresh(conversation)

    # A brand-new conversation has no messages, so last_message is None and
    # unread_count is 0. That is a real state the list screen has to draw, not
    # an edge case: pressing Message and then not typing anything leaves
    # exactly this.
    return ConversationOut(
        id=conversation.id,
        other_user=other,
        last_message=None,
        unread_count=0,
        created_at=conversation.created_at,
    )


@router.get(
    "",
    response_model=list[ConversationOut],
    summary="Every conversation you are part of, most recent first",
)
def read_conversations(
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConversationOut]:
    """The inbox.

    THIS IS THE MOST COMPLICATED QUERY IN THE PHASE, so it is worth explaining
    the shape before the code.

    Each row needs four things: the conversation, the other person, the last
    message for the preview line, and how many are unread.

    The obvious way to get the last three is to loop over the conversations and
    ask the database twice per conversation. With twenty conversations that is
    forty-one queries, and it gets worse as the list grows. That pattern has a
    name -- the N+1 problem -- and feed.py already avoids it once, with
    selectinload.

    Instead this does a fixed FOUR queries no matter how many conversations
    there are:

      1. your conversations, with both users attached
      2. the id of the newest message in each one
      3. those messages
      4. the unread count per conversation

    Then it stitches them together in Python. Four queries for twenty
    conversations, and still four for two hundred.
    """
    # 1. Your conversations. or_ because you might be either side of the pair --
    #    which side you are on depends only on whose id happens to be smaller,
    #    and carries no meaning at all.
    #
    #    selectinload fetches both users in one extra query rather than one per
    #    conversation. Same tool, same reason, as feed.py.
    conversations = list(
        db.scalars(
            select(Conversation)
            .where(
                or_(
                    Conversation.user_a_id == current_user.id,
                    Conversation.user_b_id == current_user.id,
                )
            )
            .options(
                selectinload(Conversation.user_a),
                selectinload(Conversation.user_b),
            )
        ).all()
    )

    if not conversations:
        # No conversations, so nothing to look up. Returning here saves three
        # queries whose answers could only ever be empty -- and, more usefully,
        # keeps the "in_([])" case out of the code below, which some databases
        # treat oddly.
        return []

    conversation_ids = [c.id for c in conversations]

    # 2. The newest message in each conversation.
    #
    #    max(id) rather than max(created_at): ids count upwards, so the largest
    #    id in a thread is always the newest message, and two messages sent in
    #    the same millisecond still have an order. Timestamps can tie.
    newest_ids = db.scalars(
        select(func.max(Message.id))
        .where(Message.conversation_id.in_(conversation_ids))
        .group_by(Message.conversation_id)
    ).all()

    # 3. Fetch those messages -- one query for all of them.
    last_message_by_conversation: dict[int, Message] = {}
    if newest_ids:
        for message in db.scalars(
            select(Message).where(Message.id.in_(newest_ids))
        ).all():
            last_message_by_conversation[message.conversation_id] = message

    # 4. Unread counts, in one grouped query.
    #
    #    Unread means: somebody ELSE sent it, and it has never been read. The
    #    sender_id != me half is not optional -- without it your own messages
    #    count as unread to you, and every conversation you have ever written in
    #    wears a badge that will not go away.
    unread_by_conversation = {
        conversation_id: count
        for conversation_id, count in db.execute(
            select(Message.conversation_id, func.count())
            .where(
                Message.conversation_id.in_(conversation_ids),
                Message.sender_id != current_user.id,
                Message.read_at.is_(None),
            )
            .group_by(Message.conversation_id)
        ).all()
    }

    rows = [
        ConversationOut(
            id=conversation.id,
            other_user=conversation.other_person(current_user),
            last_message=(
                ChatMessageOut.model_validate(
                    last_message_by_conversation[conversation.id]
                )
                if conversation.id in last_message_by_conversation
                else None
            ),
            unread_count=unread_by_conversation.get(conversation.id, 0),
            created_at=conversation.created_at,
        )
        for conversation in conversations
    ]

    # SORTED IN PYTHON, NOT BY THE DATABASE, and that is a deliberate trade.
    #
    # Ordering by "the time of the newest message" in SQL means joining the
    # grouped sub-query back onto conversations, which is a good deal more
    # machinery than this. Sorting here is a handful of rows -- limit caps it at
    # 50 -- so the cost is nothing and the code stays readable.
    #
    # It would be the wrong choice for a feed, where the point of ordering in
    # the database is to avoid fetching the rows you are about to throw away.
    # Here every row is being returned anyway.
    #
    # A conversation with no messages sorts by when it was created, so pressing
    # Message and typing nothing still puts it at the top where you left it.
    rows.sort(
        key=lambda row: (
            row.last_message.created_at if row.last_message else row.created_at
        ),
        reverse=True,
    )

    return rows[:limit]


@router.get(
    "/{conversation_id}",
    response_model=ConversationOut,
    summary="One conversation, for the chat screen's header",
)
def read_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationOut:
    """One conversation on its own.

    WHY THIS EXISTS, since the list endpoint above already returns every
    conversation with everything in it.

    The chat screen has to show who you are talking to -- their name and photo
    across the top. Opening /messages/12 directly, or refreshing the page while
    reading, means the browser has nothing but the number in the address.

    The two alternatives are both worse. Carrying the conversation over from the
    inbox screen works right up until somebody refreshes or shares the link, and
    then the header is blank. Fetching the whole inbox to pick one row out of it
    means downloading fifty conversations to draw one.

    THE PERMISSION CHECK IS NOT REPEATED HERE, and that is the point of
    get_conversation_or_404 existing: it is the only way to get hold of a
    conversation, so the check comes with it. A 404 for a conversation that is
    not yours, indistinguishable from one that does not exist -- see that
    function for why that matters.
    """
    conversation = get_conversation_or_404(db, conversation_id, current_user)

    # The last message, for consistency with the list endpoint. The chat screen
    # does not use it -- it loads the real messages separately -- but an
    # endpoint whose reply changes shape depending on which one you called is a
    # small cruelty to whoever writes the frontend.
    last_message = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.id.desc())
        .limit(1)
    ).first()

    unread_count = (
        db.scalar(
            select(func.count())
            .select_from(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.sender_id != current_user.id,
                Message.read_at.is_(None),
            )
        )
        or 0
    )

    return ConversationOut(
        id=conversation.id,
        other_user=conversation.other_person(current_user),
        last_message=(
            ChatMessageOut.model_validate(last_message) if last_message else None
        ),
        unread_count=unread_count,
        created_at=conversation.created_at,
    )

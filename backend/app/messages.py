"""Messages inside a conversation: sending, reading, and marking as read.

Every endpoint here begins with get_conversation_or_404, which is both the
lookup and the permission check. See conversations.py for why it answers 404
rather than 403 when the conversation is not yours.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.conversations import get_conversation_or_404
from app.database import get_db
from app.deps import get_current_user
from app.models import Message, User
from app.schemas import ChatMessageCreate, ChatMessageOut, MessageOut

# Same prefix as conversations.py, different file. The addresses belong under
# /conversations because a message only exists inside one, but the two files are
# separate because they are two jobs -- exactly as posts.py and comments.py are
# split while comments live at /posts/{id}/comments.
router = APIRouter(prefix="/conversations", tags=["messages"])

DEFAULT_LIMIT = 30
MAX_LIMIT = 100


@router.get(
    "/{conversation_id}/messages",
    response_model=list[ChatMessageOut],
    summary="Messages in a conversation, oldest first",
)
def read_messages(
    conversation_id: int,
    before: int | None = Query(
        default=None,
        description="Return messages older than this message id. Leave out for the newest.",
    ),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Message]:
    """One page of messages.

    A CHAT LOADS DIFFERENTLY FROM A FEED, and the difference is not cosmetic.

    The feed shows newest at the top and you scroll DOWN into older posts. A
    chat shows oldest at the top, opens scrolled to the BOTTOM where the newest
    message is, and you scroll UP for older ones.

    WHY `before` AND NOT `offset`. The feed uses offset -- "skip 20, give me the
    next 20" -- because it counts from the start of the list.

    That breaks here. Offset counts from a fixed end, and in a chat the list
    grows from the end you are counting from. Ask for "skip 20" while a new
    message arrives, and everything shifts by one: you get one message twice,
    or miss one entirely, and in a conversation a silently missing line is
    genuinely bad.

    `before` is a CURSOR -- a bookmark rather than a page number. "Give me the
    30 messages older than number 412" means the same thing however many new
    messages have arrived at the other end, because 412 does not move.

    16c uses the same idea pointing the other way: after the live connection
    drops and comes back, the browser asks for everything NEWER than the last
    message it has.
    """
    # The permission check and the lookup, in one call that cannot be skipped.
    get_conversation_or_404(db, conversation_id, current_user)

    query = select(Message).where(Message.conversation_id == conversation_id)

    if before is not None:
        query = query.where(Message.id < before)

    # NEWEST FIRST HERE, then reversed below, and the order of those two steps
    # is the whole trick.
    #
    # We want the 30 most recent messages older than the cursor. Sorting oldest
    # first and taking 30 would give the 30 OLDEST messages in the entire
    # conversation -- the beginning of the chat rather than the part just above
    # what is on screen.
    #
    # So: sort newest first, take 30, then turn them round for display.
    messages = list(
        db.scalars(
            query.order_by(Message.id.desc()).limit(limit)
        ).all()
    )

    # Reversed, so the browser receives them oldest-first and can draw them
    # straight down the screen in the order they were written.
    messages.reverse()

    return messages


@router.post(
    "/{conversation_id}/messages",
    response_model=ChatMessageOut,
    status_code=status.HTTP_201_CREATED,
    summary="Send a message",
)
def send_message(
    conversation_id: int,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Message:
    """Add a message to a conversation.

    Note what the browser does NOT send: who the sender is. That comes from the
    token, as it does for a post or a comment. If the browser could choose it,
    anybody could put words in somebody else's mouth inside a private chat --
    which is worse than posting as them in public, because there is no audience
    to notice.

    read_at is left NULL: it has just been sent, so of course nobody has read
    it. It is filled in when the other person calls the read endpoint below.

    In 16c this is also where the message gets pushed down the live connection
    to the other person. Nothing about the row changes for that -- the saving is
    the same, the delivery is the part that is new.
    """
    get_conversation_or_404(db, conversation_id, current_user)

    message = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        body=payload.body,
    )

    db.add(message)
    db.commit()

    # Re-read the row so id and created_at -- both filled in by PostgreSQL, not
    # by us -- are present in the reply. The browser needs the id immediately:
    # it is the cursor for loading older messages, and the thing that lets it
    # recognise this same message when it arrives back over the live connection
    # in 16c and avoid drawing it twice.
    db.refresh(message)

    return message


@router.post(
    "/{conversation_id}/read",
    response_model=MessageOut,
    summary="Mark the other person's messages in this conversation as read",
)
def mark_read(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageOut:
    """Clear the unread badge for this conversation.

    WHY THIS IS ITS OWN ENDPOINT, AND NOT SOMETHING read_messages DOES.

    Marking as read while fetching would be convenient and it would be wrong,
    for the same reason the email confirmation link in Phase 13 opens a page
    instead of hitting the API directly.

    A GET is supposed to be safe: fetching something must not change it. Things
    other than people make GET requests -- browsers pre-fetching a link the
    user might click, mobile apps warming a screen in the background, a proxy
    or scanner following an address. If reading marked messages read, a message
    could be marked read by something that was never a person, and the badge
    would clear for a message nobody saw.

    A POST says "I am doing something", and nothing fetches a POST speculatively.

    ONLY THE OTHER PERSON'S MESSAGES, and only unread ones:

      sender_id != me   your own messages are not yours to have read
      read_at IS NULL   never move a timestamp that is already set, or the
                        record of WHEN it was first read is lost every time the
                        chat is reopened
    """
    get_conversation_or_404(db, conversation_id, current_user)

    # ONE UPDATE STATEMENT, rather than loading the messages and setting a field
    # on each. Fetching a hundred unread messages into Python just to write one
    # column back is a hundred rows over the wire for no reason -- the database
    # can do the whole thing in place.
    result = db.execute(
        update(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.sender_id != current_user.id,
            Message.read_at.is_(None),
        )
        # timezone.utc, not a bare datetime.now(). A bare one is a wall-clock
        # reading with no country attached, and this column stores an absolute
        # moment. Same rule as every other timestamp in the project.
        .values(read_at=datetime.now(timezone.utc))
    )
    db.commit()

    # rowcount is how many rows the statement actually changed. Reported back
    # because it is genuinely useful to the caller: zero means there was nothing
    # unread, which is how the frontend knows not to bother redrawing the badge.
    return MessageOut(detail=f"Marked {result.rowcount} message(s) as read.")

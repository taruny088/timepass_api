"""
Public profiles: a user's details, and their photo grid.

Everything sent from here uses the slim schemas from schemas.py, which have no
email field. That is the point of this file existing separately from auth.py:
auth.py serves you your own details, this file serves other people's, and the
two are allowed to show different things.
"""

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user, get_verified_user
from app.media import delete_image, upload_image
from app.models import Follow, Post, User
from app.post_view import build_post_list
from app.schemas import PostOut, UserOut, UserProfile, UserSummary, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def get_user_by_username(db: Session, username: str) -> User:
    """Find one user by their handle, or raise 404.

    Both endpoints below start this way, so it lives in one function.

    The .lower() matters. Phase 3 stores every username in lowercase, so
    searching for "John_23" against a stored "john_23" would find nothing and
    wrongly report that the user does not exist. Forgetting this is the exact
    bug that makes /profile/John_23 fail while /profile/john_23 works.
    """
    user = db.scalars(
        select(User).where(User.username == username.lower())
    ).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    return user


@router.get(
    "/{username}",
    response_model=UserProfile,
    summary="A user's profile details",
)
def read_profile(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserProfile:
    """Return one user's public details, plus how many posts they have."""
    user = get_user_by_username(db, username)

    # Count the posts rather than storing a number on the user row.
    #
    # PLAN.md section 6 explains why: a stored count drifts. Someone deletes a
    # post, the number is not updated, and the profile shows a lie that is
    # very hard to trace back. Counting is always correct, and at this size it
    # is instant.
    #
    # select(func.count()) builds "SELECT count(*) FROM posts WHERE user_id=..".
    # scalar() means "give me the single value, not a row".
    post_count = db.scalar(
        select(func.count()).select_from(Post).where(Post.user_id == user.id)
    )

    # THE TWO LINES MOST LIKELY TO BE WRITTEN THE WRONG WAY ROUND.
    #
    # Both read the same table. Which column you filter on decides the
    # meaning, and the two look almost identical:
    #
    #   followers  = people who follow THIS user
    #                so this user is the one BEING followed
    #                -> Follow.following_id == user.id
    #
    #   following  = people THIS user follows
    #                so this user is the one DOING the following
    #                -> Follow.follower_id == user.id
    #
    # Read the comparison as "where is this user sitting in the row?"
    follower_count = db.scalar(
        select(func.count())
        .select_from(Follow)
        .where(Follow.following_id == user.id)
    )

    following_count = db.scalar(
        select(func.count())
        .select_from(Follow)
        .where(Follow.follower_id == user.id)
    )

    # Am I following them? The viewer is the follower, they are the followed.
    #
    # db.get on a composite primary key takes the two values as a tuple, in
    # the order the columns are declared on the model.
    is_following = (
        db.get(Follow, (current_user.id, user.id)) is not None
    )

    # Built by hand rather than straight from the User object, because none of
    # the counts are columns on it.
    return UserProfile(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        bio=user.bio,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        post_count=post_count,
        follower_count=follower_count,
        following_count=following_count,
        is_following=is_following,
    )


@router.get(
    "/{username}/posts",
    response_model=list[PostOut],
    summary="A user's posts, newest first",
)
def read_user_posts(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PostOut]:
    """Return every post by this user, newest first.

    An empty list is a perfectly normal answer for someone who has not posted
    yet. It is NOT a 404 -- the user exists, they simply have nothing. The
    website turns the empty list into a friendly message.
    """
    user = get_user_by_username(db, username)

    # This ordering is exactly what the index on (user_id, created_at DESC)
    # was built for, so PostgreSQL can read the rows in order rather than
    # fetching them all and sorting.
    posts = list(
        db.scalars(
            select(Post)
            .where(Post.user_id == user.id)
            .order_by(Post.created_at.desc())
            # Every post here has the same author, so this saves only one
            # query -- but it keeps every post-returning endpoint written the
            # same way, which matters more than the single query saved.
            .options(selectinload(Post.author), selectinload(Post.media))
        ).all()
    )

    return build_post_list(db, posts, current_user)


@router.post(
    "/{username}/follow",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Follow a user",
)
def follow_user(
    username: str,
    db: Session = Depends(get_db),
    # Phase 13: get_verified_user, not get_current_user.
    #
    # Same token check as before, plus an insistence that the email address on
    # the account has been confirmed. PLAN2.md names exactly three things an
    # unverified account may not do -- post, comment and follow -- and this is
    # one of them.
    #
    # It is a DEPENDENCY rather than an `if` inside the function on purpose:
    # the gate runs before this code does, so there is no path through the
    # endpoint that skips it.
    current_user: User = Depends(get_verified_user),
) -> None:
    """Start following someone.

    There is no request body. Who is doing the following comes from the
    token, exactly like the author of a post in Phase 5. If the browser could
    send follower_id, anyone could make anybody follow anybody.
    """
    target = get_user_by_username(db, username)

    # Checked here only so the user gets a clear message. The database
    # refuses this anyway, through the ck_follows_no_self_follow constraint.
    # The friendly message is ours; the guarantee is PostgreSQL's.
    if target.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot follow yourself.",
        )

    follow = Follow(follower_id=current_user.id, following_id=target.id)
    db.add(follow)

    try:
        db.commit()
    except IntegrityError:
        # Already following. The composite primary key blocked the duplicate
        # row, which is the database doing its job.
        #
        # We treat this as success rather than an error, because the caller
        # asked for "I follow this person" and that is now true. Doing it
        # twice leaves the same result as doing it once, which is called
        # being IDEMPOTENT. It means a double click or a retry on a flaky
        # connection cannot show an error for something that actually worked.
        db.rollback()

    return None


@router.delete(
    "/{username}/follow",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unfollow a user",
)
def unfollow_user(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Stop following someone.

    Idempotent for the same reason as following: unfollowing someone you do
    not follow leaves you not following them, which is what was asked for.
    So a missing row is success, not a 404.
    """
    target = get_user_by_username(db, username)

    follow = db.get(Follow, (current_user.id, target.id))

    if follow is not None:
        db.delete(follow)
        db.commit()

    return None


# How many people one request may return.
#
# No "load more" here, unlike the feed. Adding paging to a list that is
# currently a handful of names would be machinery serving nobody, and your
# rules say not to build a layer until it is needed. The cap is what stops a
# popular account one day returning ten thousand rows in one go.
#
# Phase 15 will come back to both endpoints below: once accounts can be
# private, who is allowed to SEE a follower list becomes a real question.
# Today every account is public, so there is nothing to check yet.
FOLLOW_LIST_LIMIT = 50


@router.get(
    "/{username}/followers",
    response_model=list[UserSummary],
    summary="The people who follow this user",
)
def read_followers(
    username: str,
    limit: int = Query(default=FOLLOW_LIST_LIMIT, ge=1, le=FOLLOW_LIST_LIMIT),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[User]:
    """Return the users who follow this one.

    THE DIRECTION IS THE WHOLE THING, so read it slowly.

    A row in follows means "follower_id follows following_id". This endpoint
    asks "who follows THIS person", so this person is the one BEING followed:

        Follow.following_id == user.id      <- pin down the person we are
                                               looking at
        User.id == Follow.follower_id       <- and fetch the OTHER end

    read_following below is the same query with those two swapped, and getting
    them the wrong way round is the classic bug in this part of the app. It
    fails quietly, too: both versions return a plausible list of people, so
    nothing looks broken until you notice the names are wrong.

    UserSummary has no email field, which matters here as much as it does in
    search: a follower list is shown to anyone who opens the profile.
    """
    user = get_user_by_username(db, username)

    return list(
        db.scalars(
            select(User)
            # A JOIN reads two tables as one. Here: line up every follows row
            # against the user sitting at its follower_id end, so we get people
            # rather than a list of numbers.
            .join(Follow, Follow.follower_id == User.id)
            .where(Follow.following_id == user.id)
            # Newest follower first, matching what Instagram shows.
            .order_by(Follow.created_at.desc())
            .limit(limit)
        )
    )


@router.get(
    "/{username}/following",
    response_model=list[UserSummary],
    summary="The people this user follows",
)
def read_following(
    username: str,
    limit: int = Query(default=FOLLOW_LIST_LIMIT, ge=1, le=FOLLOW_LIST_LIMIT),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[User]:
    """Return the users this one follows.

    The mirror image of read_followers. This person is the one DOING the
    following, so the two conditions swap ends:

        Follow.follower_id == user.id       <- pin down the person we are
                                               looking at
        User.id == Follow.following_id      <- and fetch the OTHER end

    Same table, opposite direction. That is why the Follow model calls itself
    the trickiest table in the project.
    """
    user = get_user_by_username(db, username)

    return list(
        db.scalars(
            select(User)
            .join(Follow, Follow.following_id == User.id)
            .where(Follow.follower_id == user.id)
            .order_by(Follow.created_at.desc())
            .limit(limit)
        )
    )


@router.post(
    "/me/avatar",
    response_model=UserOut,
    summary="Upload or replace your own profile picture",
)
async def upload_avatar(
    image: UploadFile = File(..., description="The photo. JPEG, PNG, GIF or WebP."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> User:
    """Set the logged-in user's profile picture.

    NOTE THE ADDRESS: /users/me/avatar, not /users/{username}/avatar.

    "me" is not a username -- it means "whoever this token belongs to". There is
    deliberately no way to name the user here, because if there were, the server
    would have to check that the name matches the token on every request, and
    forgetting that check once is how someone changes another person's photo.

    An endpoint that CANNOT express the wrong user is safer than one that checks.

    This is the first endpoint in the project that changes your own account, so
    it is the first place that rule comes up. Phase 13 adds more of them --
    display name, bio, password -- and they all follow this shape.

    No migration was needed: users.avatar_url has existed since Phase 1, holding
    nothing. This finally fills it in.
    """
    uploaded = await upload_image(image, folder="timepass/avatars")

    # Remember the old one before overwriting, so it can be cleaned up.
    #
    # Without this, changing your photo ten times leaves nine files on
    # Cloudinary that nothing points at and nothing will ever remove.
    old_public_id = current_user.avatar_public_id

    current_user.avatar_url = uploaded.url
    current_user.avatar_public_id = uploaded.public_id

    db.commit()
    db.refresh(current_user)

    # AFTER the commit, for the same reason as deleting a post: the database is
    # the thing that must be right. A leftover file is untidy; a user row
    # pointing at a photo that has just been deleted is a broken profile.
    delete_image(old_public_id)

    return current_user


@router.patch(
    "/me",
    response_model=UserOut,
    summary="Edit your own display name and bio",
)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> User:
    """Change part of the logged-in user's own profile.

    Same address shape as /me/avatar above, and for the same reason: "me"
    means "whoever this token belongs to". There is no way to name a user
    here, so this endpoint CANNOT be pointed at somebody else's account. An
    endpoint that cannot express the wrong user is safer than one that
    remembers to check.

    PATCH, not PUT. Both words tell the server what kind of change is coming.
    PUT means "replace the whole record with this" -- anything left out gets
    wiped. PATCH means "change only what I sent". Since the edit page may well
    send just a bio, PUT would quietly blank the display name, so PATCH is the
    honest description of what is happening here.

    A note on the route table: FastAPI matches routes in the order they are
    written, and this file already has GET /users/{username} above. If this
    were a GET, /users/me would be swallowed by that one and read as a request
    for a user literally named "me". It is a PATCH and nothing else in this
    file is, so there is no clash -- but that is luck rather than design, and
    it is the trap to remember if a /me/... GET is ever added here.
    """
    # THIS LINE IS THE WHOLE POINT OF THE ENDPOINT.
    #
    # model_dump turns the validated payload back into a plain dictionary.
    # exclude_unset=True leaves out every field the browser did not actually
    # include in the request.
    #
    # That is what separates the two cases the schema could not:
    #
    #   sent nothing at all      -> "bio" is NOT a key here -> leave it alone
    #   sent "bio": null or ""   -> "bio" IS a key, worth None -> clear it
    #
    # Without exclude_unset both arrive as None and every edit would wipe
    # every field the form happened not to mention. It is a quiet, total data
    # loss bug, and this one argument is the entire defence against it.
    changes = payload.model_dump(exclude_unset=True)

    # Written out one field at a time on purpose. A loop over the dictionary
    # would be shorter, but it would also happily write ANY key that turned up
    # in it straight onto the user row. Naming the two editable fields here
    # means this endpoint can never be talked into changing a third one.
    if "full_name" in changes:
        current_user.full_name = changes["full_name"]

    if "bio" in changes:
        current_user.bio = changes["bio"]

    # current_user is a live database row, not a copy. SQLAlchemy has been
    # watching the two assignments above, so commit writes exactly those
    # columns and nothing else. There is no UPDATE statement to write.
    db.commit()
    db.refresh(current_user)

    return current_user

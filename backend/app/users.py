"""
Public profiles: a user's details, and their photo grid.

Everything sent from here uses the slim schemas from schemas.py, which have no
email field. That is the point of this file existing separately from auth.py:
auth.py serves you your own details, this file serves other people's, and the
two are allowed to show different things.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import Follow, Post, User
from app.post_view import build_post_list
from app.schemas import PostOut, UserProfile, UserSummary

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
    current_user: User = Depends(get_current_user),
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

"""
Public profiles: a user's details, and their photo grid.

Everything sent from here uses the slim schemas from schemas.py, which have no
email field. That is the point of this file existing separately from auth.py:
auth.py serves you your own details, this file serves other people's, and the
two are allowed to show different things.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Post, User
from app.schemas import PostOut, UserProfile

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

    # Built by hand rather than straight from the User object, because
    # post_count is not a column on it.
    return UserProfile(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        bio=user.bio,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        post_count=post_count,
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
) -> list[Post]:
    """Return every post by this user, newest first.

    An empty list is a perfectly normal answer for someone who has not posted
    yet. It is NOT a 404 -- the user exists, they simply have nothing. The
    website turns the empty list into a friendly message.
    """
    user = get_user_by_username(db, username)

    # This ordering is exactly what the index on (user_id, created_at DESC)
    # was built for, so PostgreSQL can read the rows in order rather than
    # fetching them all and sorting.
    posts = db.scalars(
        select(Post)
        .where(Post.user_id == user.id)
        .order_by(Post.created_at.desc())
    ).all()

    return list(posts)

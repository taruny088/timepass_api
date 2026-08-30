"""
Liking and unliking a post.

Both endpoints are IDEMPOTENT: doing the same thing twice leaves the same
result as doing it once, and reports success both times.

That matters more here than anywhere else in the project. The heart button
updates the screen before the server has answered, so an impatient double tap
sending two requests is not a rare accident -- it is the expected case. An
error for the second one would be an error for something that worked.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Like, Post, User

router = APIRouter(prefix="/posts", tags=["likes"])


def get_post_or_404(db: Session, post_id: int) -> Post:
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found.",
        )
    return post


@router.post(
    "/{post_id}/like",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Like a post",
)
def like_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Like a post. Liking one you already like changes nothing."""
    post = get_post_or_404(db, post_id)

    db.add(Like(user_id=current_user.id, post_id=post.id))

    try:
        db.commit()
    except IntegrityError:
        # The composite primary key refused a second identical row, which is
        # the database doing exactly its job. The caller asked for "I like
        # this post" and that is true, so this is success, not an error.
        db.rollback()

    return None


@router.delete(
    "/{post_id}/like",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unlike a post",
)
def unlike_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Remove a like. Unliking something you never liked changes nothing."""
    post = get_post_or_404(db, post_id)

    # db.get on a composite primary key takes the values as a tuple, in the
    # order the columns are declared on the model: (user_id, post_id).
    like = db.get(Like, (current_user.id, post.id))

    if like is not None:
        db.delete(like)
        db.commit()

    return None

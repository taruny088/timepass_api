"""
Writing, reading and deleting comments.

The delete endpoint is where this phase reuses Phase 5's ownership idea, with
one twist: TWO people are allowed to delete a comment, not one.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import Comment, Post, User
from app.schemas import CommentCreate, CommentOut

router = APIRouter(tags=["comments"])


def get_post_or_404(db: Session, post_id: int) -> Post:
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found.",
        )
    return post


@router.post(
    "/posts/{post_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Write a comment",
)
def create_comment(
    post_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Comment:
    """Add a comment under a post.

    Neither the author nor the post can be chosen by the browser: the author
    comes from the token, and the post comes from the address. Only the text
    is sent.
    """
    post = get_post_or_404(db, post_id)

    comment = Comment(
        post_id=post.id,
        user_id=current_user.id,
        body=payload.body,
    )

    db.add(comment)
    db.commit()
    db.refresh(comment)

    return comment


@router.get(
    "/posts/{post_id}/comments",
    response_model=list[CommentOut],
    summary="Read a post's comments",
)
def read_comments(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Comment]:
    """Return a post's comments, oldest first.

    Oldest first, unlike posts. A comment thread reads as a conversation from
    the top, while a feed reads newest first. The index on
    (post_id, created_at) is built ascending to match this exactly.

    An empty list is a normal answer for a post nobody has commented on.
    """
    post = get_post_or_404(db, post_id)

    comments = db.scalars(
        select(Comment)
        .where(Comment.post_id == post.id)
        .order_by(Comment.created_at, Comment.id)
        # The N+1 fix again. Without it, drawing 30 comments would cost one
        # extra query per distinct author to fill in the nested author field.
        .options(selectinload(Comment.author))
    ).all()

    return list(comments)


@router.delete(
    "/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a comment",
)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a comment you wrote, or any comment on a post you own.

    Phase 5's ownership check, with one extra branch. TWO different people
    have the right to remove a comment:

      the person who WROTE it   -- it is their words
      the person who owns the POST -- it is their photo, and they should be
                                      able to take something unpleasant off it

    Anyone else gets a 403, checked on the server where nobody can reach it.
    Hiding the delete button on screen stops nobody, exactly as in Phase 5.
    """
    comment = db.get(Comment, comment_id)

    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found.",
        )

    post = db.get(Post, comment.post_id)

    wrote_the_comment = comment.user_id == current_user.id
    owns_the_post = post is not None and post.user_id == current_user.id

    if not (wrote_the_comment or owns_the_post):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments.",
        )

    db.delete(comment)
    db.commit()

    return None

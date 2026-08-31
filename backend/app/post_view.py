"""
Turning Post rows into PostOut replies, with their counts attached.

WHY THIS FILE EXISTS.

PLAN.md refuses to store a like_count on each post, because a stored count
drifts out of step with reality. So counts must be worked out when asked.

For one post that is easy. But the feed shows twenty posts, and each one
needs a like count, a comment count, and "did I like this?". Done the obvious
way -- ask those three questions inside a loop, once per post -- that is
sixty extra queries for one screen. It is the N+1 problem from Phase 7,
three times over, and it is very easy to write without noticing.

The fix is the same shape as selectinload: when you need something for every
row, fetch it for EVERY ROW AT ONCE rather than row by row.

    1 query   the posts themselves
    1 query   their authors        (selectinload, from Phase 7)
    1 query   like counts,    grouped, for all these post ids
    1 query   comment counts, grouped, for all these post ids
    1 query   which of these post ids I have liked
    -------
    5 queries for a page of 20 -- and still 5 for a page of 100

Three endpoints return posts (the feed, a single post, a profile grid), so
this lives in one file they all call rather than being written three times.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Comment, Like, Post, User
from app.schemas import PostMediaOut, PostOut, UserSummary


def build_post_list(
    db: Session,
    posts: list[Post],
    current_user: User,
) -> list[PostOut]:
    """Attach counts to a list of posts and return them ready to send.

    posts must already be loaded, ideally with selectinload(Post.author) so
    the authors do not cost one query each.
    """
    if not posts:
        # No posts means no ids to ask about, and "WHERE post_id IN ()" is
        # not a sensible query. Returning early also saves three round trips.
        return []

    post_ids = [post.id for post in posts]

    # How many likes does each of these posts have?
    #
    # GROUP BY post_id turns "all the like rows" into "one row per post, with
    # a count". The result is turned into a dictionary so we can look up any
    # post's count instantly while building the replies below.
    #
    # Posts with no likes at all simply do not appear in the result, which is
    # why the lookups below use .get(id, 0) rather than [id].
    like_counts = dict(
        db.execute(
            select(Like.post_id, func.count())
            .where(Like.post_id.in_(post_ids))
            .group_by(Like.post_id)
        ).all()
    )

    comment_counts = dict(
        db.execute(
            select(Comment.post_id, func.count())
            .where(Comment.post_id.in_(post_ids))
            .group_by(Comment.post_id)
        ).all()
    )

    # Which of these posts have I liked?
    #
    # One query returning a set of post ids, rather than asking "did I like
    # this one?" separately for each post on the screen.
    liked_post_ids = set(
        db.scalars(
            select(Like.post_id).where(
                Like.post_id.in_(post_ids),
                Like.user_id == current_user.id,
            )
        ).all()
    )

    return [
        PostOut(
            id=post.id,
            # post.media is already sorted, because the relationship in
            # models.py carries order_by="PostMedia.position". Relying on that
            # rather than sorting again here keeps the ordering rule in ONE
            # place -- if it were repeated, the two could drift apart and the
            # carousel would show photos in a different order on different
            # screens.
            media=[PostMediaOut.model_validate(m) for m in post.media],
            caption=post.caption,
            created_at=post.created_at,
            author=UserSummary.model_validate(post.author),
            like_count=like_counts.get(post.id, 0),
            comment_count=comment_counts.get(post.id, 0),
            is_liked=post.id in liked_post_ids,
        )
        for post in posts
    ]


def build_post(db: Session, post: Post, current_user: User) -> PostOut:
    """The same thing for a single post.

    Written in terms of the list version so there is only one place where a
    PostOut is actually assembled. If a field is added later, it is added
    once.
    """
    return build_post_list(db, [post], current_user)[0]

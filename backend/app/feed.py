"""
The home feed.

PLAN.md section 3 says that under the design, Instagram is four things:

    1. a list of people          -> the users table
    2. a list of posts           -> the posts table
    3. a list of who follows whom -> the follows table
    4. ONE QUESTION that joins list 3 to list 2

This file is item 4, and that question is:

    "Show me the newest posts written by the people I follow."

Everything built in Phases 2 to 6 existed to make the query below possible.
It is about fifteen lines.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import Follow, Post, User
from app.post_view import build_post_list
from app.schemas import PostOut

router = APIRouter(prefix="/feed", tags=["feed"])

# How many posts one page holds when the caller does not say.
DEFAULT_LIMIT = 20

# A ceiling, so nobody can ask for a million posts in one request and make the
# server do enormous work. Never let the caller choose an unbounded amount.
MAX_LIMIT = 50


@router.get("", response_model=list[PostOut], summary="Posts from the people you follow")
def read_feed(
    # Query(...) describes a value that arrives in the address, as in
    #     /feed?limit=20&offset=40
    # ge and le mean "greater than or equal" and "less than or equal", so
    # FastAPI rejects a bad number with a 422 before this function runs.
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PostOut]:
    """Return posts written by the people this user follows, newest first.

    THE JOIN, in plain English:

        start from the posts table,
        attach the follows rows where the post's author is the person being
            followed,
        keep only the follows rows where I am the follower,
        sort newest first,
        and give me one page of them.

    A JOIN means answering a question by combining two tables in one query.
    Every query before this one touched a single table. This one cannot,
    because WHO I follow lives in follows and WHAT THEY WROTE lives in posts.
    """
    statement = (
        select(Post)

        # THE LINE THAT IS THE ENTIRE PRODUCT.
        #
        # Read it as: "the person being followed is the person who wrote this
        # post". That single equals sign is what turns a photo store into a
        # social network.
        .join(Follow, Follow.following_id == Post.user_id)

        # AND THE LINE MOST LIKELY TO BE WRITTEN THE WRONG WAY ROUND.
        #
        # I am the FOLLOWER. Written as Follow.following_id by mistake, the
        # feed would show posts by people who follow ME -- a completely
        # different app, and one that looks perfectly fine if everybody
        # happens to follow each other back.
        .where(Follow.follower_id == current_user.id)

        # Newest first. This is exactly what the (user_id, created_at DESC)
        # index added in Phase 5 was built for; PLAN.md called it out as the
        # second of the two questions this app is built around, and this is
        # that question, five phases later.
        #
        # The id is a tie-breaker. Two posts created in the same instant would
        # otherwise come back in an unpredictable order, and with offset
        # paging an unstable order means page 2 can repeat or skip a post.
        .order_by(Post.created_at.desc(), Post.id.desc())

        # THE N+1 FIX.
        #
        # PostOut nests the author, so drawing the feed needs each post's
        # author. Without this line SQLAlchemy fetches them lazily -- going
        # back to the database the moment the code touches post.author.
        #
        # Measured on this project's own data, 20 posts by 10 different
        # authors:
        #
        #     without this line : 11 queries  (1 for the posts + 1 per author)
        #     with this line    :  2 queries
        #
        # The cost is one query per DISTINCT author, not per post, because
        # SQLAlchemy remembers an author it has already loaded. So a feed of
        # 20 posts all by the same person costs 2 queries either way, and a
        # feed of 20 posts by 20 different people costs 21.
        #
        # This is the N+1 problem: one query, plus N more. It is the most
        # common performance mistake in ORM code, and it grows with the page.
        #
        # selectinload tells SQLAlchemy to collect every author in ONE extra
        # query instead.
        .options(selectinload(Post.author), selectinload(Post.media))

        # PLAN.md: "the feed loads twenty posts at a time rather than all of
        # them. If a user follows fifty people with hundreds of posts each,
        # loading everything would be slow and pointless."
        #
        # offset skips rows, limit caps them. "Skip 20, give me the next 20."
        #
        # A known flaw of offset paging, worth knowing rather than
        # discovering: if someone posts while you are reading page 1,
        # everything shifts down by one, so page 2 repeats a post you already
        # saw. Harmless at this size. Real feeds outgrow it and switch to
        # remembering the last post seen instead of counting rows skipped.
        .offset(offset)
        .limit(limit)
    )

    posts = list(db.scalars(statement).all())

    # Attach like and comment counts, and whether this viewer liked each one.
    # build_post_list does that in a fixed number of queries however many
    # posts are on the page -- see post_view.py for why that matters.
    #
    # An empty list is a perfectly normal answer -- it means this person
    # follows nobody yet, or the people they follow have not posted. That is
    # not an error, so it is a 200 with [], never a 404. The website turns it
    # into a friendly message.
    return build_post_list(db, posts, current_user)

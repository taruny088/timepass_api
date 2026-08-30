"""
Finding people.

NOTE: this is NOT one of the nine features in PLAN.md. It was added on
purpose to close a real gap -- the app has follow buttons and a feed built on
following people, but no way to find anybody without typing their address by
hand.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import UserSummary

# Mounted at /search rather than /users/search on purpose.
#
# /users/search would be matched against the existing /users/{username} route,
# and FastAPI would try to read "search" as a username. It CAN be made to work
# by declaring this route before that one, but then the code depends on the
# order lines happen to appear in a file, and someone tidying up one day
# breaks it silently. Same reasoning as /feed rather than /posts/feed.
router = APIRouter(prefix="/search", tags=["search"])

DEFAULT_LIMIT = 10
MAX_LIMIT = 25


def escape_for_like(text: str) -> str:
    r"""Make user-typed text safe to use inside a LIKE pattern.

    In SQL's LIKE, three characters are special:

        %   means "any number of any characters"
        _   means "exactly one of any character"
        \   escapes the two above

    So a user typing a single % into the search box would produce the pattern
    '%%%', which matches EVERY user in the database. Typing _ would match any
    single character. Neither is what they meant.

    Escaping them turns each one back into an ordinary character to look for.
    The backslash must be replaced first, or it would then escape the escapes
    we just added.

    To be clear about what this is and is not: this is NOT protection against
    SQL injection. Nothing typed here can become SQL, because SQLAlchemy sends
    the value as a separate parameter rather than pasting it into the query
    text. This is only about wildcards behaving as wildcards.
    """
    return (
        text.replace("\\", r"\\").replace("%", r"\%").replace("_", r"\_")
    )


@router.get(
    "/users",
    response_model=list[UserSummary],
    summary="Find people by username or name",
)
def search_users(
    q: str = Query(..., min_length=1, max_length=50, examples=["mal"]),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[User]:
    """Return users whose username or full name contains the search text.

    Results use UserSummary, which has no email field. These go to everyone,
    so that protection matters as much here as it does for post authors.
    """
    term = q.strip()

    if not term:
        # The box held only spaces. Nothing to look for, and searching for an
        # empty string would match every user.
        return []

    pattern = f"%{escape_for_like(term)}%"

    # ilike is LIKE that ignores capital letters, so "MAL" finds "mallory".
    #
    # or_ means either side may match, so searching "smith" finds someone
    # whose full name is "John Smith" even though their username is john_23.
    #
    # A note on how fast this is, or is not: a pattern beginning with % cannot
    # use an ordinary database index. An index finds things by how they START,
    # and this asks "contains", so PostgreSQL reads every row. With a few
    # dozen users that is instant. With a million it would not be, and the
    # real answer then is a different kind of index (pg_trgm) or full text
    # search. Not worth adding to a project this size, but worth knowing the
    # ceiling is there.
    statement = (
        select(User)
        .where(
            or_(
                User.username.ilike(pattern),
                User.full_name.ilike(pattern),
            )
        )
        # Alphabetical: predictable, and honest about the fact that we are not
        # ranking by relevance or popularity.
        .order_by(User.username)
        .limit(limit)
    )

    return list(db.scalars(statement).all())

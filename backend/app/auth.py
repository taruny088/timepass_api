"""
The three signup and login endpoints.

This is the only file in Phase 3 that makes decisions. security.py knows how
to scramble a password but not whether this password is right for this
person. schemas.py knows what a valid signup looks like but not whether the
username is free. Those judgements live here.

    POST /auth/signup  -> create an account
    POST /auth/login   -> check a password, hand back a token
    GET  /auth/me      -> read a token, report who it belongs to
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import Token, UserCreate, UserLogin, UserOut
from app.security import (
    create_access_token,
    hash_password,
    verify_password,
    waste_time_like_a_real_check,
)

# An APIRouter is a group of endpoints that gets plugged into the main app.
# The prefix is added to every path below, so "/signup" becomes
# "/auth/signup". The tag is only cosmetic: it groups these three together
# under a heading on the /docs page.
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/signup",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account",
)
def signup(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    """Create a new account.

    By the time this function starts running, Pydantic has already checked
    that the username, email and password are well formed, and has lowercased
    the username and email. Anything malformed was rejected before we got
    here, so payload can be trusted to have the right SHAPE. Whether it
    CONFLICTS with existing data is what we check now.
    """
    # A friendly check first, so the user gets a message naming the exact
    # field that clashed.
    #
    # select(User).where(...) is SQLAlchemy's way of writing
    # "SELECT * FROM users WHERE ...". scalars().first() means "give me the
    # first matching User object, or None".
    existing = db.scalars(
        select(User).where(
            (User.username == payload.username) | (User.email == payload.email)
        )
    ).first()

    if existing is not None:
        if existing.username == payload.username:
            detail = "That username is already taken."
        else:
            detail = "That email is already registered."
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    user = User(
        username=payload.username,
        email=payload.email,
        # The plain password is used once, here, and never stored. From this
        # line on, only the scrambled version exists.
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
    )

    db.add(user)

    try:
        # commit() is the moment the row is actually written and PostgreSQL
        # applies its own rules.
        db.commit()
    except IntegrityError:
        # The friendly check above is not enough on its own, and this is why.
        #
        # Two people signing up with the same username at the same instant can
        # BOTH pass that check, because both look before either one saves.
        # Only the unique rule inside PostgreSQL actually stops the second --
        # exactly the rule we watched fire in Phase 2.
        #
        # rollback() undoes this half-finished write so the session can be
        # used again. Without it the session stays stuck in a failed state.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username or email is already taken.",
        )

    # The row now exists, but our Python object does not yet know the id or
    # created_at that PostgreSQL filled in. refresh() re-reads the row so
    # those values are present in the reply.
    db.refresh(user)

    # We return the whole User object, password_hash and all. It is safe
    # because response_model=UserOut above rebuilds the reply from the seven
    # listed fields and discards the rest.
    return user


@router.post("/login", response_model=Token, summary="Log in and get a token")
def login(payload: UserLogin, db: Session = Depends(get_db)) -> Token:
    """Check an email and password, and hand back a signed token."""
    user = db.scalars(
        select(User).where(User.email == payload.email)
    ).first()

    if user is None:
        # No account with that email. We could return immediately, but a real
        # password check takes bcrypt about a tenth of a second, and returning
        # instantly here would let a stranger tell the two cases apart by
        # timing them alone -- leaking exactly what our vague message below is
        # trying to hide. So we spend the same time on purpose.
        waste_time_like_a_real_check()
        raise invalid_login()

    if not verify_password(payload.password, user.password_hash):
        raise invalid_login()

    # The token carries the user's id and nothing else. Remember that anyone
    # holding it can read that id -- it is signed, not encrypted. A user
    # already knows their own id, so nothing is leaked.
    return Token(access_token=create_access_token(user.id))


def invalid_login() -> HTTPException:
    """One single error for both 'no such email' and 'wrong password'.

    Saying which one was wrong would be friendlier, and would also hand a
    stranger a tool for discovering which email addresses have accounts here:
    type an address, read which message comes back. That is called user
    enumeration. One message for both cases closes it.
    """
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.get("/me", response_model=UserOut, summary="Who am I?")
def read_me(current_user: User = Depends(get_current_user)) -> User:
    """Report the details of whoever's token was sent with this request.

    Look at how little is in this function. All the work -- find the token,
    check the signature, check the expiry, look the user up, refuse if any
    step fails -- happened in get_current_user before this line was reached.
    If current_user exists at all, the request is already proven.

    Every protected endpoint in Phases 5 to 8 will follow this same shape.
    """
    return current_user

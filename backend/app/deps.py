"""
Who is asking?

This file holds one function, get_current_user. It takes the token attached
to a request and turns it into a real User from the database, or refuses the
request outright.

Every endpoint from here to the end of the project that needs a logged-in
user will use this. When Phase 5 asks "is this your post to delete?", the
"your" comes from here.

The word DEPENDENCY: in FastAPI, a dependency is a function that runs before
your endpoint and hands it something it needs. You write

    def delete_post(user: User = Depends(get_current_user)):

and FastAPI runs get_current_user first, passing the result in as `user`. If
the dependency raises an error instead, the endpoint never runs at all. That
is what makes it a gate: the protection is not something the endpoint has to
remember to do.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_access_token

# Tells FastAPI to look for a header shaped like:
#
#     Authorization: Bearer eyJhbGciOi...
#
# It also makes the Authorize button appear on the /docs page, which is how
# you will paste your token in when testing.
#
# auto_error=False means: if the header is missing, hand us None instead of
# raising an error automatically. We want to raise our own error so that a
# missing token and a bad token produce the same 401 with the same wording.
# Left on its own, FastAPI would return 403 for a missing header, which is
# the wrong code -- 403 means "I know who you are and you still may not",
# while 401 means "I do not know who you are".
bearer_scheme = HTTPBearer(auto_error=False)


# Built once and reused. Every failure below raises this same error on
# purpose: a missing token, an expired one, a forged one and a deleted
# account all produce an identical reply, so nobody can learn anything from
# the difference between them.
CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials.",
    # The HTTP standard says a 401 must say which kind of proof it wanted.
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Turn the token on this request into the User it belongs to.

    Raises 401 if there is no usable token, or if the user it names is gone.
    """
    # 1. Is there a token at all?
    if credentials is None:
        raise CREDENTIALS_ERROR

    # 2. Is it genuine and still in date?
    #    decode_access_token returns None for tampered, forged, expired and
    #    malformed tokens alike. We do not need to know which.
    user_id = decode_access_token(credentials.credentials)

    if user_id is None:
        raise CREDENTIALS_ERROR

    # 3. Does that user still exist?
    #
    #    This lookup is not optional. The token says "user 7" and it is
    #    correctly signed, but a token proves only WHO ISSUED IT -- not that
    #    its subject still exists. If account 7 was deleted an hour ago, the
    #    token is still perfectly valid and must still be refused. So we ask
    #    the database on every single request.
    user = db.get(User, user_id)

    if user is None:
        raise CREDENTIALS_ERROR

    return user


# Phase 13. The second gate.
#
# get_current_user answers "who is asking?". This answers "may they do this?",
# and they are genuinely different questions -- somebody can be perfectly,
# provably logged in and still not allowed to post.
VERIFICATION_ERROR = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Confirm your email address before doing this.",
)


def get_verified_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Like get_current_user, but also insists the email has been confirmed.

    WHY 403 AND NOT 401. 401 means "I do not know who you are" -- send a token
    and try again. 403 means "I know exactly who you are, and the answer is
    still no". Sending 401 here would make every client assume the login had
    expired and bounce a perfectly valid user to the login page, where logging
    in again would change nothing at all.

    NOTE THAT THIS DEPENDS ON ANOTHER DEPENDENCY. FastAPI works out the whole
    chain: it runs get_current_user first, hands the result in here, and only
    then runs the endpoint. So an endpoint asking for a verified user gets the
    token check for free and cannot accidentally get one without the other.

    WHAT UNVERIFIED MEANS IN THIS APP, per PLAN2.md: you may log in and look
    around, but not post, comment or follow. Blocking login outright is harsher
    than Instagram and makes the app painful to demonstrate -- and someone who
    cannot get in cannot press "resend" either.

    Liking is deliberately NOT gated. PLAN2 names three actions and this is the
    list it names. Inventing a fourth would be building something nobody asked
    for, and a like is the least consequential thing on the site.

    THE POINT OF PUTTING THIS HERE. The banner in the interface is a courtesy,
    not a lock -- anything running in a browser can be switched off by whoever
    is running the browser. This function is the actual rule, it runs on the
    server, and every endpoint that needs it gets it by asking for this
    dependency instead of remembering to write a check.
    """
    if not current_user.is_verified:
        raise VERIFICATION_ERROR

    return current_user

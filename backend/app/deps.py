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

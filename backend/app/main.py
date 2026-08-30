"""
The backend application itself.

/health, from Phase 1, proves the whole chain works:

    browser -> FastAPI -> SQLAlchemy -> PostgreSQL

The signup and login endpoints live in auth.py and are plugged in below. This
file stays small on purpose: its job is to assemble the app, not to hold
features. Each later phase adds one more router here.
"""

import os

from fastapi import Depends, FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import auth, comments, feed, likes, posts, search, users
from app.database import get_db

app = FastAPI(title="Insta Clone API")

# Where the website is allowed to call us from. app.database has already run
# load_dotenv by the time this line executes, so the value from .env is here.
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

# MIDDLEWARE is code that runs on EVERY request, before and after the endpoint.
# get_current_user was a gate on particular endpoints; middleware wraps all of
# them at once.
#
# Why this is needed at all: your browser refuses to let a page loaded from
# one address send requests to a different address. The website runs on port
# 5173 and this backend on port 8000, which count as different addresses, so
# without this the browser blocks our own website from calling our own API.
#
# That browser rule is called the same-origin policy and it is protecting you:
# without it, any site you visited could quietly send requests to your bank
# using your logged-in session. This middleware is how a server says "requests
# from this particular origin are expected, allow them".
app.add_middleware(
    CORSMiddleware,
    # Only this exact origin. Never use ["*"] on an API that accepts logins:
    # it would let any website on the internet call this backend.
    allow_origins=[FRONTEND_ORIGIN],
    # Permit the Authorization header carrying the login token.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Plugs each feature's endpoints into the app. Without these lines the
# endpoints exist as Python code but the app does not serve them.
app.include_router(auth.router)    # /auth/signup, /auth/login, /auth/me
app.include_router(posts.router)   # /posts
app.include_router(users.router)   # /users/{username}
app.include_router(feed.router)    # /feed
app.include_router(likes.router)   # /posts/{id}/like
app.include_router(comments.router)  # /posts/{id}/comments, /comments/{id}
app.include_router(search.router)  # /search/users


@app.get("/health")
def health(response: Response, db: Session = Depends(get_db)):
    """Report whether the backend is up and can actually reach the database."""
    try:
        # The simplest question PostgreSQL can be asked: reply with the
        # number 1. We do not care about the answer, only that one came back.
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "error", "database": "not connected"}

    return {"status": "ok", "database": "connected"}

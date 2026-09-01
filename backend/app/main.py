"""
The backend application itself.

/health, from Phase 1, proves the whole chain works:

    browser -> FastAPI -> SQLAlchemy -> PostgreSQL

The signup and login endpoints live in auth.py and are plugged in below. This
file stays small on purpose: its job is to assemble the app, not to hold
features. Each later phase adds one more router here.
"""

import os

import logging
import traceback

from fastapi import Depends, FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import account, auth, comments, feed, likes, posts, search, users
from app.database import get_db

app = FastAPI(title="Timepass API")

# Where the website is allowed to call us from.
#
# app.database has already run load_dotenv by the time this line executes, so
# the value from backend/.env is available. On a hosting platform there is no
# .env file at all -- load_dotenv simply does nothing, and os.getenv reads the
# real environment variables the platform provides instead.
#
# The value may list SEVERAL addresses separated by commas, so the same
# deployment can allow the live site and a developer's laptop at once:
#
#     FRONTEND_ORIGIN=http://localhost:5173,https://insta-clone.onrender.com
#
# With no comma it is simply a list of one, which is why local development is
# unaffected.
_frontend_origins_raw = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

# .strip() removes stray spaces around a comma, so "a, b" works as well as
# "a,b".
#
# .rstrip("/") removes a trailing slash, and that matters more than it looks.
# The CORS check compares plain text, so "https://site.com" and
# "https://site.com/" are two different things to it. A stray slash is one of
# the most common deployment mistakes, and it fails silently from the server's
# side -- the browser reports the error, the backend logs nothing unusual.
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in _frontend_origins_raw.split(",")
    if origin.strip()
]

# --- Crashes must still answer with CORS headers -----------------------------
#
# A BUG THAT COST REAL DEBUGGING TIME, so it is worth understanding properly.
#
# When an endpoint raises HTTPException -- a 401, a 404 -- FastAPI turns it into
# a normal response, it passes back out through the CORS middleware below, and
# the browser receives a proper error the website can display.
#
# When an endpoint raises something UNEXPECTED -- say a database error because a
# table is missing -- the 500 is produced by a layer that sits OUTSIDE the CORS
# middleware. It never passes through it, so it carries no
# access-control-allow-origin header. The browser then blocks the response
# before any JavaScript sees it.
#
# The result is the worst kind of error message: the website reports "cannot
# reach the server" while the server is up, healthy, and answering in half a
# second. You go and check whether the backend is running. It is. The real
# cause -- one broken query -- is invisible.
#
# This middleware catches anything that escapes an endpoint and turns it into an
# ordinary JSON response. Because it is INSIDE the CORS middleware, that
# response gets the headers, reaches the browser, and says what happened.
#
# ORDER MATTERS AND IS BACK TO FRONT. In Starlette the LAST middleware added is
# the OUTERMOST. So this one is added BEFORE the CORS middleware below, which
# puts CORS on the outside where it can add headers to what this returns. Swap
# the two blocks and the bug comes straight back.
@app.middleware("http")
async def catch_unhandled_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        # Log the real traceback to the server's own output. The browser gets a
        # short message; the details stay here.
        #
        # NEVER send the traceback to the browser. It names file paths, library
        # versions and sometimes query contents -- a map of the application for
        # anyone looking for a way in.
        logging.error("Unhandled error on %s %s", request.method, request.url.path)
        logging.error(traceback.format_exc())

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": (
                    "Something went wrong on the server. This is a fault in the "
                    "app, not something you did."
                )
            },
        )


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
    # Only these exact origins. Never use ["*"] on an API that accepts
    # logins: it would let any website on the internet call this backend.
    allow_origins=ALLOWED_ORIGINS,
    # Permit the Authorization header carrying the login token.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Plugs each feature's endpoints into the app. Without these lines the
# endpoints exist as Python code but the app does not serve them.
app.include_router(auth.router)    # /auth/signup, /auth/login, /auth/me
app.include_router(account.router)  # /auth/verify-email, /auth/resend-verification
app.include_router(posts.router)   # /posts
app.include_router(users.router)   # /users/{username}
app.include_router(feed.router)    # /feed
app.include_router(likes.router)   # /posts/{id}/like
app.include_router(comments.router)  # /posts/{id}/comments, /comments/{id}
app.include_router(search.router)  # /search/users


@app.get("/health")
def health(response: Response, db: Session = Depends(get_db)):
    """Report whether the backend is up, reaches the database, and can upload.

    WHY THIS REPORTS ON SETTINGS AND NOT JUST ON BEING ALIVE.

    A setting that is present on a laptop and missing in production is invisible
    until somebody uses the feature and gets an error. Phase 12 cost an evening
    to exactly that: the Cloudinary keys were in backend/.env and were never
    added to Render, so uploads failed in production only, and the way to find
    out was to try to post a photo.

    Now one address answers it:

        https://<the-api>/health

    NOTHING SECRET IS SENT. Each entry is true or false -- whether a setting has
    a value, never what the value is. That distinction is the whole design of
    this endpoint: it is public, unauthenticated, and readable by anyone who
    guesses the address, so it may report the SHAPE of the configuration and
    never its contents.
    """
    try:
        # The simplest question PostgreSQL can be asked: reply with the
        # number 1. We do not care about the answer, only that one came back.
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "error", "database": "not connected"}

    # Imported here rather than at the top of the file on purpose.
    #
    # app/media.py configures the Cloudinary library when it is first imported.
    # Doing that at module level here would mean the whole backend refuses to
    # start if anything in that file is unhappy -- and losing the entire site
    # over a missing upload key would be far worse than losing uploads.
    from app.media import API_KEY, API_SECRET, CLOUD_NAME

    uploads_configured = bool(CLOUD_NAME and API_KEY and API_SECRET)

    return {
        "status": "ok",
        "database": "connected",
        # "configured" rather than "working". This says the three settings have
        # values; it does not say they are the RIGHT values, or that Cloudinary
        # is reachable. Claiming more than we have checked would make this
        # endpoint a liar in exactly the situation it exists to diagnose.
        "uploads": "configured" if uploads_configured else "not configured",
    }

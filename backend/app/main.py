"""
The backend application itself.

/health, from Phase 1, proves the whole chain works:

    browser -> FastAPI -> SQLAlchemy -> PostgreSQL

The signup and login endpoints live in auth.py and are plugged in below. This
file stays small on purpose: its job is to assemble the app, not to hold
features. Each later phase adds one more router here.
"""

from fastapi import Depends, FastAPI, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db

app = FastAPI(title="Insta Clone API")

# Plugs in the three endpoints defined in auth.py: /auth/signup, /auth/login
# and /auth/me. Without this line those endpoints exist as Python code but
# the app does not serve them.
app.include_router(auth.router)


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

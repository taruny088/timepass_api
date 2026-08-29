"""
The backend application itself.

Phase 1 has no features. It has one endpoint, /health, whose only job is to
prove the whole chain works:

    browser -> FastAPI -> SQLAlchemy -> PostgreSQL
"""

from fastapi import Depends, FastAPI, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db

app = FastAPI(title="Insta Clone API")


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

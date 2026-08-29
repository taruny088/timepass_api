"""
The one place in this project that knows how to reach the database.

Every other file that needs the database imports from here. That way the
connection details live in exactly one file and nowhere else.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# __file__ is this file's own location. .resolve() turns it into a full path,
# then .parent twice climbs from app/database.py up to the backend/ folder.
# We build the path this way so the .env file is found no matter which folder
# the server was started from.
BACKEND_DIR = Path(__file__).resolve().parent.parent

# Reads backend/.env and loads each line into this program's environment
# variables, so os.getenv below can find them.
load_dotenv(BACKEND_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL is None:
    raise RuntimeError(
        "DATABASE_URL is missing. Copy backend/.env.example to backend/.env "
        "and fill in your PostgreSQL password."
    )

# The engine manages the real connections to PostgreSQL. It is created once
# when the app starts and reused for the whole life of the app.
engine = create_engine(DATABASE_URL)

# A factory that makes Session objects. A Session is one short conversation
# with the database, opened for a single request and closed afterwards.
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    """
    Hand one database session to a request, then close it when the request is
    finished, even if the request failed partway through.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

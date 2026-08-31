"""
Build the tables described in app/models.py inside PostgreSQL.

Run this by hand from the backend folder, with the virtual environment
active:

    python create_tables.py

It is safe to run more than once. It creates tables that are missing and
leaves existing ones alone.

IMPORTANT LIMITATION: this only ever CREATES missing tables. It will never
change a table that already exists. If you add a column to a model later and
run this again, PostgreSQL will say "I already have that table" and do
nothing at all, and your Python and your database will quietly disagree.

FROM PHASE 12 ONWARD, ALEMBIC OWNS CHANGES TO EXISTING TABLES.

Never use this script to change a table that already exists. Phase 12 moved
posts.image_url into a new post_media table; this script would have created
post_media and then silently left posts alone, and the live site would have
been running code that expected a column layout the database did not have.

Setting up a BRAND NEW, EMPTY database:

    python create_tables.py          # builds every table from models.py
    alembic stamp head               # record that it is already up to date

That second line matters. This script builds the tables as models.py describes
them TODAY -- which already includes post_media and already lacks image_url.
Running `alembic upgrade head` instead would then try to drop a column that was
never there. `stamp` writes down "this database is current" without running
anything.

Changing a database that ALREADY EXISTS -- your laptop, or the live site:

    alembic revision --autogenerate -m "what changed"
    # then READ the generated file and fix it before running it
    alembic upgrade head
"""

from app.database import Base, engine

# This import looks unused, and deleting it is a real trap.
#
# Python only reads a file when something imports it. If app/models.py is
# never imported, the line "class User(Base)" is never executed, nothing is
# ever recorded in Base.metadata, and create_all below would find an empty
# list and build nothing at all -- with no error message.
#
# Importing the module is what registers the tables. Every future table file
# must be imported here too.
import app.models  # noqa: F401


def main() -> None:
    print("Connecting and creating any missing tables...")

    # Reads every table recorded in Base.metadata, asks PostgreSQL which of
    # them already exist, and sends CREATE TABLE only for the missing ones.
    Base.metadata.create_all(bind=engine)

    created = ", ".join(sorted(Base.metadata.tables))
    print(f"Done. Tables now described by this project: {created}")


if __name__ == "__main__":
    main()

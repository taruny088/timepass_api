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
While the tables are still empty the fix is to drop the table and run this
again. Once there is real data worth keeping, the proper tool is a migration
library such as Alembic.
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

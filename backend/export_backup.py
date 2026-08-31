"""
Export every table to a JSON file, so a bad migration can be undone.

Run it from the backend folder with the virtual environment active:

    python export_backup.py                     # whatever DATABASE_URL points at
    $env:DATABASE_URL="postgresql+psycopg://..."; python export_backup.py

It writes backups/backup-YYYY-MM-DD-HHMM.json and prints a row count per table.

WHY THIS EXISTS. Phase 12 is the first change that can destroy real data: the
migration copies posts.image_url into post_media and then drops the column. It
was tested locally and the downgrade works -- and neither of those is a reason
to skip a backup. A backup is what makes a mistake annoying instead of final.

WHY NOT pg_dump. It is the proper tool, and it refuses to run when its version
does not match the server's, which is a fight you do not want to be having
while the live site is down. This uses the database connection the app already
has, so if the app can reach the database, so can this.

WHAT IT DOES NOT DO. It is a plain data dump, not a restore tool. Putting the
data back means reading the JSON and inserting it, which is a job for a person
who has thought about what went wrong -- not a script run in a panic.

This is also the export the project will need before the free database is
deleted on 29 September 2026.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import inspect, select, text

from app.database import engine

BACKUP_DIR = Path(__file__).resolve().parent / "backups"


def to_jsonable(value):
    """Turn a database value into something json.dump can write.

    Dates are the only awkward type here. isoformat keeps the timezone, which
    matters -- a timestamp without one is ambiguous by up to a day.
    """
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def main() -> None:
    BACKUP_DIR.mkdir(exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")
    path = BACKUP_DIR / f"backup-{stamp}.json"

    with engine.connect() as connection:
        # Ask the database which tables it actually has, rather than listing
        # them here. A hand-written list is one that silently misses the table
        # someone added last week -- which is exactly the data you would want.
        table_names = sorted(inspect(engine).get_table_names())

        # Say which database this is, out loud, before writing anything.
        # Running the wrong command against the wrong database is the way these
        # things go wrong, and the fix is to make it obvious which one you are
        # touching.
        server = connection.execute(
            text("SELECT current_database(), inet_server_addr()::text")
        ).one()
        print(f"database : {server[0]}")
        print(f"host     : {server[1] or 'local socket'}")
        print()

        data = {}
        for name in table_names:
            rows = connection.execute(select(text("*")).select_from(text(name)))
            columns = rows.keys()
            data[name] = [
                {column: to_jsonable(value) for column, value in zip(columns, row)}
                for row in rows
            ]
            print(f"  {name:<16} {len(data[name]):>5} rows")

    path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    print()
    print(f"Written to {path}")
    print(f"Size: {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()

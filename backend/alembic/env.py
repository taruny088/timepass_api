"""
How Alembic finds the database and the models.

Alembic generated this file. Two things have been changed, and both matter.

1. THE DATABASE ADDRESS COMES FROM THE ENVIRONMENT, NOT FROM alembic.ini.

   By default Alembic reads the connection string out of alembic.ini. That file
   is committed to Git, so putting a real database password in it would publish
   the password -- exactly what your rules forbid.

   Instead we import the same DATABASE_URL that app/database.py already uses,
   which comes from backend/.env locally and from Render's environment settings
   in production. One address, defined once.

   It also means the SAME command runs against either database. Point
   DATABASE_URL at the live one and `alembic upgrade head` migrates production.
   That is convenient and it is sharp: check which database you are pointed at
   before running anything.

2. target_metadata IS OUR Base.metadata.

   This is what lets `alembic revision --autogenerate` compare the models in
   models.py against the real tables and write a first draft of the change.

   AUTOGENERATE IS A DRAFT, NEVER AN ANSWER. It sees that a column is gone and
   writes DROP COLUMN. It cannot know you meant to MOVE the data somewhere
   first, so it will happily generate a migration that throws away every photo
   in the app. Read every generated file before running it.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Importing app.database runs it, which loads backend/.env and works out the
# connection string. We borrow the result rather than repeating the logic.
from app.database import DATABASE_URL, Base

# Importing models is what registers every table on Base.metadata.
#
# Exactly the same trap as create_tables.py: Python only reads a file when
# something imports it, so without this line Base.metadata is empty, and
# autogenerate would decide that every table in the database is unknown to us
# and should be deleted. The "noqa" tells the linter the import is used for its
# side effect rather than for a name.
import app.models  # noqa: F401,E402

# The Alembic Config object, giving access to the values in alembic.ini.
config = context.config

# Push the real address in, overriding whatever placeholder alembic.ini holds.
#
# The doubled %% is not a typo. ConfigParser treats a single % as the start of
# a substitution, so a password containing one would crash with a confusing
# error about interpolation. Doubling it escapes it.
config.set_main_option("sqlalchemy.url", DATABASE_URL.replace("%", "%%"))

# Sets up Python logging, so migrations report what they are doing.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# What the models say the database SHOULD look like.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Print the SQL instead of running it.

    Started with `alembic upgrade head --sql`. Useful for reading exactly what
    a migration will do to the live database before letting it near it.
    """
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Connect to the database and actually run the migrations."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        # Everything inside one transaction. If a migration fails half way,
        # PostgreSQL undoes the whole thing rather than leaving the database
        # in a state that is neither the old shape nor the new one.
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

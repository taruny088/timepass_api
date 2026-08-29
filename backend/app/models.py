"""
The shape of every table in the database, described in Python.

This file is a blueprint and nothing else. It does not connect to the
database, it does not run any queries, and it holds no rules about who is
allowed to do what. Its only job is to say what columns exist and what each
one is allowed to hold.

Phase 2 has one table: users.
"""

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    """One person with an account.

    The class describes the table. One instance of this class is one row,
    which is to say one user.
    """

    # The real name of the table inside PostgreSQL. Without this line
    # SQLAlchemy would have to guess. The class is singular (one user) and the
    # table is plural (many users), which is the usual convention.
    __tablename__ = "users"

    # The permanent identity of this user. PostgreSQL fills it in by counting
    # up: 1, 2, 3. We never set it ourselves.
    #
    # Every other table will point at a user using this number rather than the
    # username, because a username can be changed and this number cannot. A
    # primary key is indexed automatically, so it needs no index of its own.
    id: Mapped[int] = mapped_column(primary_key=True)

    # The public handle, e.g. "john_23". This is what appears in the address
    # bar on a profile page.
    #
    # unique=True asks PostgreSQL itself to refuse a second row with the same
    # username. That matters because two signups arriving at the same instant
    # can both pass a "is this taken?" check in Python before either one is
    # saved. Only the database-level rule actually stops the second one.
    #
    # In PostgreSQL a unique rule is stored as a unique index, so this also
    # makes "find the user called john_23" fast. Adding index=True as well
    # would build a second index doing the same job.
    username: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)

    # The address used to log in. Must identify exactly one person, otherwise
    # "log me in as this email" has no single answer.
    #
    # 255 is the conventional size for an email column; the longest address the
    # internet standard allows is 254 characters.
    #
    # This column does not check that the text looks like an email. Checking
    # the shape of incoming data is Pydantic's job in Phase 3, at the door
    # where data enters. The database's job is storing it and keeping it
    # unique.
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    # The scrambled password, never the real one.
    #
    # The name says "hash" on purpose, so that anyone reading this file knows
    # immediately that this value must never be printed, logged, or sent to
    # the browser.
    #
    # A bcrypt hash is exactly 60 characters, but 255 leaves room to switch to
    # a different scrambling method later without changing the table. A short
    # value in a varchar(255) uses no more space than in a varchar(60), so the
    # extra room costs nothing.
    #
    # Deliberately NOT unique: two people are allowed to pick the same
    # password, and a unique rule here would leak that fact to a stranger.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Everything below here is optional.
    #
    # Mapped[str | None] means the value may be missing. In the database that
    # missing value is NULL, which means "not provided". NULL is not an empty
    # string and it is not zero.

    # The display name, e.g. "John Smith". Not everyone wants to give a real
    # name, and none of the app's features break without it.
    full_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # The short description on the profile page. The 200 character limit is
    # enforced by PostgreSQL, which protects the profile layout from someone
    # pasting an entire novel.
    bio: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # A link to the profile photo, not the photo itself. Databases are bad at
    # storing large files: it bloats backups and slows down every query on the
    # table. Real image links can be long, hence 500.
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # The exact moment the account was created.
    #
    # timezone=True stores an absolute point in time rather than a wall-clock
    # reading with no country attached. Without it, two users in different
    # parts of the world signing up at the same real instant would be stored
    # as different-looking times, and sorting by "newest first" would be
    # wrong. The feed in Phase 7 is built entirely on that sort order.
    # The rule for this project: store UTC, display local.
    #
    # server_default writes DEFAULT now() into the table itself, so PostgreSQL
    # fills the value in no matter where the row came from, including a row
    # typed by hand in psql. A plain default= would only work for rows that
    # travel through this Python code. func.now() means "call the database's
    # own now() function", so the time comes from one single clock.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        """How one User prints when debugging. Note that it deliberately does
        not include password_hash."""
        return f"<User id={self.id} username={self.username!r}>"

"""
The shape of every table in the database, described in Python.

This file is a blueprint and nothing else. It does not connect to the
database, it does not run any queries, and it holds no rules about who is
allowed to do what. Its only job is to say what columns exist and what each
one is allowed to hold.

Tables so far:
  users    (Phase 2)
  posts    (Phase 5)
  follows  (Phase 6)
"""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

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

    # Every post this user has written.
    #
    # A RELATIONSHIP is not a column. Nothing is stored in the users table for
    # this. It is a convenience SQLAlchemy provides: write user.posts and it
    # runs "SELECT * FROM posts WHERE user_id = ..." for you.
    #
    # back_populates says this and Post.author are the same link seen from the
    # two ends, so SQLAlchemy keeps them in step with each other.
    #
    # cascade="all, delete-orphan" is the Python-side twin of the ON DELETE
    # CASCADE rule on the posts table. The database rule handles a row deleted
    # by raw SQL; this one handles a User deleted through SQLAlchemy. Setting
    # both means the behaviour is the same whichever route the delete takes.
    posts: Mapped[list["Post"]] = relationship(
        back_populates="author",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        """How one User prints when debugging. Note that it deliberately does
        not include password_hash."""
        return f"<User id={self.id} username={self.username!r}>"


class Post(Base):
    """One photo post.

    PLAN.md feature 4: a photo is added by pasting an image link, not by
    uploading a file. So this table stores the ADDRESS of an image, never the
    image itself. Databases are bad at holding large files -- it bloats every
    backup and slows every query on the table.
    """

    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Which user wrote this post.
    #
    # This is a FOREIGN KEY: a column that points at a row in another table,
    # and the first one in this project. It does two jobs.
    #
    # 1. It connects the tables, so we can go from a post to its author.
    # 2. PostgreSQL ENFORCES that the target exists. Try to save a post with
    #    user_id = 999 when there is no user 999 and the database refuses it.
    #    Broken links are impossible, not merely unlikely.
    #
    # ondelete="CASCADE" answers "what happens to this post if its author is
    # deleted?" CASCADE means the post is deleted too, automatically, by
    # PostgreSQL. The alternative would leave posts pointing at a user who no
    # longer exists, which is exactly the broken state the foreign key is
    # meant to prevent.
    #
    # No index=True here, even though "find every post by this user" is one
    # of the two questions this app is built around. The composite index at
    # the bottom of this class already covers it: an index on
    # (user_id, created_at) can answer any question about user_id on its own,
    # because user_id is its first column. Adding index=True as well would
    # build a second index doing the same job -- wasting disk and slowing
    # down every insert, since each one has to update both.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # A link to the photo. Required -- a post with no image is not a post.
    # 500 characters because real image links carry size and token parameters
    # and get long. Same size as users.avatar_url, for the same reason.
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)

    # The text under the photo. Optional, as PLAN.md says.
    #
    # 2200 is Instagram's own caption limit, so it is a real number rather
    # than one invented here. The limit is enforced by PostgreSQL, which
    # protects the page layout from someone pasting an entire book.
    caption: Mapped[str | None] = mapped_column(String(2200), nullable=True)

    # Same reasoning as users.created_at: timezone=True stores an absolute
    # moment so "newest first" sorts correctly for users anywhere in the
    # world, and server_default makes PostgreSQL fill it in regardless of how
    # the row arrived.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # The other end of User.posts. Lets us write post.author.username instead
    # of looking the user up by hand in every endpoint.
    #
    # A COST worth knowing about now, because it matters in Phase 7: if you
    # loop over 20 posts and touch post.author each time, SQLAlchemy runs 20
    # extra queries, one per post. That is called the N+1 problem. It does not
    # matter at this size, and the fix is one line when the feed needs it.
    author: Mapped["User"] = relationship(back_populates="posts")

    # Table-level settings go here, as opposed to the per-column ones above.
    __table_args__ = (
        # The index PLAN.md section 6 asks for.
        #
        # Our two most common questions are "this user's posts, newest first"
        # (the profile grid, this phase) and "these users' posts, newest
        # first" (the feed, Phase 7). Both want the same ordering, so we ask
        # PostgreSQL to keep it prepared rather than sorting from scratch
        # every time.
        #
        # .desc() means newest first. The order in the index matters: it must
        # match the order the query asks for, or the index cannot be used.
        Index(
            "ix_posts_user_id_created_at",
            "user_id",
            created_at.desc(),
        ),
    )

    def __repr__(self) -> str:
        return f"<Post id={self.id} user_id={self.user_id}>"


class Follow(Base):
    """One person following another person.

    THIS IS THE TRICKIEST TABLE IN THE PROJECT, and it is worth slowing down.

    Every foreign key so far pointed at a DIFFERENT table: posts.user_id
    points at users. This table has TWO foreign keys and BOTH point back at
    users. The table connects a table to itself.

    One row means "person A follows person B":

        follower_id   the person DOING the following
        following_id  the person BEING followed

    The slippery part is that the same table answers two opposite questions,
    and which column you filter on flips the meaning completely:

        "who do I follow?"    ->  WHERE follower_id  = me, read following_id
        "who follows me?"     ->  WHERE following_id = me, read follower_id

    Those two lines look almost identical and mean opposite things. Getting
    them the wrong way round is the single most likely bug in this phase, and
    the symptom is that follower and following counts appear swapped.
    """

    __tablename__ = "follows"

    # Note there is no id column. The primary key is the PAIR of columns
    # below, which is called a COMPOSITE PRIMARY KEY: a key made of two
    # columns together instead of one.
    #
    # Marking both as primary_key=True is how that is expressed.
    #
    # Why this is better than an id here: the pair being unique means the
    # database physically cannot store "John follows Mary" twice. If a double
    # click sends the request twice, PostgreSQL blocks the second one, and no
    # "have they already followed?" check has to exist anywhere in our code.
    # The rule lives in the one place that cannot be bypassed -- the same
    # reasoning as unique=True on usernames in Phase 2.

    follower_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    following_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # No relationship() attributes on this class, deliberately.
    #
    # With two foreign keys pointing at the same table, SQLAlchemy cannot
    # guess which one a relationship should follow, so each would need an
    # explicit foreign_keys=... argument. Nothing in this phase needs them:
    # the counts are done with SELECT count(*), which is simpler and clearer.
    # They can be added later if a screen ever needs to list actual people.

    __table_args__ = (
        # Nobody can follow themselves.
        #
        # PLAN.md asks for this rule. Putting it in the database rather than
        # only in the endpoint means it holds however the row arrives --
        # including a row typed by hand in psql, or a future bug in our code.
        # The endpoint will ALSO check, but only so the user gets a friendly
        # message instead of a raw database error.
        CheckConstraint(
            "follower_id <> following_id",
            name="ck_follows_no_self_follow",
        ),

        # An index for "who follows this user?", used for the follower count.
        #
        # The composite primary key already indexes follower_id, because it is
        # that key's FIRST column -- so "who do I follow?" is fast for free.
        # But "who follows this user?" filters on following_id, which is NOT
        # the leading column, so it needs an index of its own.
        #
        # Compare with Phase 5, where I removed an index because the composite
        # one already covered it. This one is genuinely needed. The difference
        # is entirely about which column comes first.
        Index("ix_follows_following_id", "following_id"),
    )

    def __repr__(self) -> str:
        return f"<Follow follower={self.follower_id} following={self.following_id}>"

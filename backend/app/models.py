"""
The shape of every table in the database, described in Python.

This file is a blueprint and nothing else. It does not connect to the
database, it does not run any queries, and it holds no rules about who is
allowed to do what. Its only job is to say what columns exist and what each
one is allowed to hold.

Tables so far:
  users     (Phase 2)
  posts     (Phase 5)
  follows   (Phase 6)
  likes     (Phase 8)
  comments  (Phase 8)
"""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
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

    # What Cloudinary calls the avatar file, so the old one can be removed when
    # a new one is uploaded.
    #
    # Same reasoning as post_media.public_id: Cloudinary identifies a file by
    # its public_id, not its address. Without this, changing your photo ten
    # times leaves nine files nothing points at and nothing will ever clean up.
    #
    # Nullable, because most users have no avatar at all yet.
    avatar_public_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # When this person proved they own the email address on the account, or
    # NULL if they never have.
    #
    # WHY A TIMESTAMP AND NOT A TRUE/FALSE.
    #
    # is_verified would answer "are they verified". This answers that AND
    # "since when", for the same price -- NULL means no, anything else means
    # yes. The moment costs nothing to store and is the sort of thing you very
    # much want when something looks wrong later.
    #
    # Every account that existed before this column did is filled in by the
    # migration. They signed up when there was no verification to do, and
    # locking six real accounts out of posting because the rules changed
    # underneath them would be punishing them for our timing.
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

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

    @property
    def is_verified(self) -> bool:
        """Has this person confirmed their email address?

        A PROPERTY is a method that is read like a plain value: write
        user.is_verified, not user.is_verified(). Nothing is stored for it --
        it is worked out from email_verified_at every time it is read, so it
        can never drift out of step with the column the way a second stored
        field would.

        It exists so that the rest of the app never has to spell out
        `user.email_verified_at is not None`. Written out in five places, that
        phrase eventually gets typed as `is None` in one of them, and the bug
        is a permission check that lets exactly the wrong people through.
        """
        return self.email_verified_at is not None

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

    # image_url USED TO BE HERE, and Phase 12 moved it out.
    #
    # A post now holds SEVERAL photos, which one column cannot express -- you
    # would end up with image_url_2, image_url_3 and a fixed ceiling, or a list
    # crammed into one string that the database cannot search or count. The
    # right shape is a second table with one row per photo: see PostMedia at
    # the bottom of this file.
    #
    # The column was not simply deleted. There were real photos in it, so the
    # migration copies every value into post_media before dropping it. That is
    # exactly why Alembic starts in this phase: create_tables.py would have
    # created post_media and then silently left posts alone, and the code and
    # the database would have quietly disagreed.

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

    # The photos, always in the order they were chosen.
    #
    # order_by is doing real work here. SQL has NO inherent row order: without
    # it PostgreSQL may hand these back in any order it likes, and it usually
    # looks correct in testing and then shuffles once the table grows. That is
    # the worst kind of bug -- one that only appears in production.
    #
    # cascade="all, delete-orphan" means deleting a post deletes its photo rows
    # through SQLAlchemy. The ForeignKey below ALSO says ondelete="CASCADE", so
    # PostgreSQL enforces the same rule underneath. Both, on purpose: the
    # database rule is the one that holds even when a row is deleted by hand.
    media: Mapped[list["PostMedia"]] = relationship(
        back_populates="post",
        cascade="all, delete-orphan",
        order_by="PostMedia.position",
    )

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


class Like(Base):
    """One person liking one post.

    Shaped exactly like Follow: no id column, and a COMPOSITE PRIMARY KEY
    made of the two columns together.

    PLAN.md section 6 explains why that matters here:

        "the database now physically refuses to store the same person liking
         the same post twice. If my code accidentally sends the like twice,
         the database blocks the second one. I do not need to write any 'have
         they already liked this?' check in my code."

    That is worth more in this phase than anywhere else. The heart button
    updates the screen before the server answers, so a double tap sending two
    requests is not a rare accident -- it is expected.
    """

    __tablename__ = "likes"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"),
        primary_key=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        # PLAN.md asks for an index on post_id, "because I often count how
        # many likes one post has".
        #
        # The composite primary key already indexes user_id, since that is
        # its FIRST column -- so "which posts did this person like?" is
        # covered for free. Counting the likes ON a post filters by post_id,
        # which is the second column, so it needs an index of its own.
        #
        # Identical reasoning to the follows table in Phase 6.
        Index("ix_likes_post_id", "post_id"),
    )

    def __repr__(self) -> str:
        return f"<Like user={self.user_id} post={self.post_id}>"


class Comment(Base):
    """One comment written under one post.

    Unlike likes and follows, this table DOES have an id column. The
    difference is what you need to point at.

    A like has nothing to say beyond "this person liked this post", so the
    pair of people-and-post IS the whole fact, and that pair identifies it.
    A comment has its own content, and you need to be able to delete one
    particular comment -- so it needs its own name.

    PLAN.md: comments are FLAT. There are no replies to replies. That keeps
    the table simple and the screen simple.
    """

    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)

    # TWO foreign keys, because a comment belongs to a post AND to a person.
    # They point at two DIFFERENT tables, so unlike the follows table there
    # is no ambiguity and relationships work without extra hints.
    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # The comment text. Required -- an empty comment is not a comment.
    # 2200 matches the caption limit, so the two behave the same way.
    body: Mapped[str] = mapped_column(String(2200), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Who wrote it. Needed so a comment can be shown with a name and avatar
    # without a separate lookup per comment.
    author: Mapped["User"] = relationship()

    __table_args__ = (
        # PLAN.md asks for an index on post_id together with created_at.
        #
        # The question this answers is "show me this post's comments, in
        # order", which is the only way comments are ever read.
        #
        # Note the direction: ascending, NOT descending like posts. Comments
        # read oldest-first, as a conversation from the top. Posts read
        # newest-first. The index has to match the order the query asks for
        # or it cannot be used.
        Index("ix_comments_post_id_created_at", "post_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Comment id={self.id} post={self.post_id}>"


class PostMedia(Base):
    """One photo belonging to one post.

    WHY A SECOND TABLE RATHER THAN MORE COLUMNS.

    A post can now hold up to ten photos. The tempting shapes are both wrong:

      image_url_1 ... image_url_10   ten columns, nine of them usually empty,
                                     a hard ceiling, and "how many photos does
                                     this post have" becomes ten checks.

      one column holding a list      the database cannot count them, cannot
                                     index them, and cannot stop a malformed
                                     one being stored. It becomes text that
                                     only Python understands.

    The right shape is one row per photo. Ten photos is ten rows; one photo is
    one row; the count is COUNT(*); and the ceiling is a rule we choose rather
    than a column layout we are stuck with.

    This is the same relationship the app already has twice -- one user has
    many posts, one post has many comments. One post has many photos.
    """

    __tablename__ = "post_media"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Which post this photo belongs to.
    #
    # ondelete="CASCADE" makes PostgreSQL delete these rows when the post goes.
    # Without it, deleting a post would fail because rows here still point at
    # it -- or worse, leave photo rows pointing at a post that no longer
    # exists.
    #
    # No index=True: the unique constraint below starts with post_id, and in
    # PostgreSQL a unique rule is stored as an index. It already answers
    # "this post's photos" on its own. A second index would be wasted disk and
    # extra work on every insert.
    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Where the photo actually lives -- a Cloudinary address.
    #
    # Only the LINK is stored. The file itself never touches this server,
    # because Render wipes the server's own disk on every restart and every
    # deploy. A photo saved there would disappear with no error and no
    # explanation.
    #
    # 500 characters to match posts.image_url before it and users.avatar_url:
    # real image links carry size and token parameters and get long.
    url: Mapped[str] = mapped_column(String(500), nullable=False)

    # What Cloudinary calls this file, e.g. "timepass/posts/c4ubc7fqf21ufp8".
    #
    # WHY THE URL IS NOT ENOUGH. Cloudinary identifies a file by its public_id,
    # not by its address. Without this column, deleting a post removes the row
    # and leaves the photo sitting on Cloudinary forever, with nothing pointing
    # at it and nothing that will ever clean it up.
    #
    # NULLABLE, AND THAT IS NOT LAZINESS. The posts made before Phase 12 hold
    # links that were pasted from other websites -- picsum.photos and the like.
    # Those files are not on Cloudinary at all, so they have no public_id and
    # never can. Anything deleting from Cloudinary must skip a row where this is
    # empty, or it will ask Cloudinary to remove a file it has never heard of.
    public_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Which photo this is: 0 first, then 1, 2 and so on.
    #
    # THE ORDER MUST BE STORED, NOT ASSUMED. It is tempting to rely on the
    # order the rows were inserted, or on the id, and both are wrong: SQL has
    # no inherent row order, so without an explicit ORDER BY the database may
    # return rows however it finds them fastest. That usually looks correct on
    # a small table and starts shuffling as it grows.
    #
    # Storing the position also means a photo can later be moved or removed
    # without the rest becoming meaningless.
    position: Mapped[int] = mapped_column(nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # The other end of Post.media.
    post: Mapped["Post"] = relationship(back_populates="media")

    __table_args__ = (
        # No two photos in the same post may claim the same position.
        #
        # Python could check this before inserting, and that check can lose:
        # two requests arriving at the same instant can both look, both find
        # the position free, and both insert. Only the database can actually
        # prevent it.
        #
        # It doubles as the index for "this post's photos, in order", because
        # PostgreSQL stores a unique rule as an index and its columns are in
        # exactly the order that query asks for.
        UniqueConstraint("post_id", "position", name="uq_post_media_post_position"),
        # Positions start at 0 and cannot be negative. A cheap rule that stops
        # a whole category of nonsense reaching the table.
        CheckConstraint("position >= 0", name="ck_post_media_position_positive"),
    )

    def __repr__(self) -> str:
        return f"<PostMedia post={self.post_id} position={self.position}>"


class EmailToken(Base):
    """One single-use code sent to somebody by email.

    WHY ONE TABLE FOR TWO DIFFERENT JOBS.

    Confirming an email address and resetting a password look like separate
    features, and they are not. Both do exactly the same four things: make a
    long random code, email it, check it came back unspoilt, and retire it.
    The only difference is what happens after the check succeeds.

    So one table with a `purpose` column, rather than two tables whose rules
    would have to be kept in step by hand. Every rule below -- hashed, expires,
    used once -- is written down once and applies to both.

    THE THREE RULES THAT MAKE THIS SAFE, AND WHY EACH IS NEEDED.

      Stored hashed    A stolen copy of this table must not hand the thief
                       working reset links for every account in it.

      Expires          A link found in an inbox next year must be dead.

      Used once        A link that has already done its job must be dead too,
                       so a forwarded or leaked email is worthless.

    They cover different attacks and none of them substitutes for another.
    Expiry alone leaves a link live for an hour to anyone who can see the
    inbox. Single use alone leaves an unused link working forever.
    """

    __tablename__ = "email_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Whose account this code is for.
    #
    # ondelete="CASCADE": delete the user and their outstanding codes go with
    # them. Leaving them behind would mean a live reset code pointing at an
    # account that no longer exists.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # "verify_email" or "password_reset".
    #
    # This is checked when a code is redeemed, and that check is doing real
    # work. Without it a verification link -- which is emailed to an address we
    # have NOT yet proved belongs to anyone -- could be handed to the password
    # reset endpoint instead. The two codes look identical; only this column
    # says which door each one opens.
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)

    # The code, scrambled. THE REAL CODE IS NEVER STORED ANYWHERE.
    #
    # It exists twice for a few seconds -- in memory here, and in the email we
    # send -- and after that only the person holding the email has it. That is
    # the same arrangement as a password.
    #
    # SHA-256 rather than bcrypt, which is the one place this deliberately
    # differs from how passwords are stored, for two reasons:
    #
    #   A password is short and human-chosen, so it can be guessed, and bcrypt
    #   being slow is what makes guessing impractical. This code is 32 random
    #   bytes. Nobody guesses it in the lifetime of the sun, so slowness buys
    #   nothing.
    #
    #   bcrypt salts every hash differently, so the same input hashes to a
    #   different value each time. That is exactly right for passwords and
    #   useless here: we would have no way to LOOK THE CODE UP, and would have
    #   to test the incoming code against every row in the table.
    #
    # unique=True because a repeat means our random source has failed, and it
    # is better to find that out as a loud error than to have two accounts
    # sharing a code. 64 characters is what SHA-256 is in hexadecimal.
    #
    # index=True because every redemption is a lookup by this column, and this
    # is the only way to find a row.
    token_hash: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )

    # After this moment the code is refused. Set when the code is made.
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # NULL until the code is redeemed, then the moment it was.
    #
    # A timestamp rather than a used=True flag, for the same reason as
    # email_verified_at above: it answers "was it used" and "when" together.
    #
    # The row is stamped rather than deleted. A deleted row cannot tell you
    # whether a code was already used or never existed, and those two want
    # different explanations when someone says their link did not work.
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        """Note what is missing: token_hash. Even the scrambled form has no
        business appearing in a log file or a terminal by accident."""
        return (
            f"<EmailToken id={self.id} user_id={self.user_id} "
            f"purpose={self.purpose!r} used={self.used_at is not None}>"
        )

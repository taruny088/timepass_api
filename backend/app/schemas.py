"""
The shapes of data going in and coming out of the API.

A schema is a description of what a piece of data must look like. Pydantic
reads these classes and checks every incoming request against them
automatically, so a request with a missing field or a malformed email is
rejected at the door with a clear message and never reaches our real code.

There are two kinds of class in this file, and keeping them apart is the
point:

  IN  schemas (UserCreate, UserLogin) -- what the outside world may SEND us.
  OUT schemas (UserOut, Token)        -- what the outside world may SEE.

Notice that neither kind matches the User model in models.py exactly. That
gap is deliberate. The database row has a password_hash column; UserOut does
not list it, so it physically cannot be sent to a browser.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# bcrypt ignores anything past the 72nd byte of a password, so we refuse
# longer ones here rather than silently accepting a weaker password than the
# user thought they chose. security.py enforces the same limit; this is the
# copy that produces a friendly message for the user.
MAX_PASSWORD_LENGTH = 72
MIN_PASSWORD_LENGTH = 8


class UserCreate(BaseModel):
    """What someone must send to POST /auth/signup."""

    # Field(...) attaches rules to a field. The three dots mean "required".
    # min_length / max_length are checked by Pydantic before our code runs.
    #
    # pattern is a regular expression: a small language for describing which
    # text is allowed. ^[a-zA-Z0-9_]+$ reads as "from start (^) to end ($),
    # one or more (+) characters, each of which is a letter, a digit or an
    # underscore". It blocks spaces, dots, slashes and emoji, which keeps
    # usernames safe to put in a web address later.
    username: str = Field(
        ...,
        min_length=3,
        max_length=30,
        pattern=r"^[a-zA-Z0-9_]+$",
        examples=["john_23"],
    )

    # EmailStr is a Pydantic type that checks the text actually looks like an
    # email address. This is the type that needs the email-validator library.
    email: EmailStr = Field(..., examples=["john@example.com"])

    password: str = Field(
        ...,
        min_length=MIN_PASSWORD_LENGTH,
        max_length=MAX_PASSWORD_LENGTH,
        examples=["correct-horse-battery"],
    )

    # str | None with a default of None means optional: the field may be left
    # out entirely, or sent as null.
    full_name: str | None = Field(default=None, max_length=100)

    # A field_validator is our own extra rule, run after Pydantic's built-in
    # checks pass. mode="after" means the value is already known to be a
    # valid string by the time we see it.
    @field_validator("username")
    @classmethod
    def username_to_lowercase(cls, value: str) -> str:
        """Store every username in lowercase.

        Without this, "John" and "john" would be two separate accounts,
        because the database compares text exactly. Lowercasing on the way in
        means the unique rule in PostgreSQL does what a human expects.
        """
        return value.lower()

    @field_validator("email")
    @classmethod
    def email_to_lowercase(cls, value: str) -> str:
        """Same reasoning as usernames. Nobody expects Bob@x.com and
        bob@x.com to be different accounts."""
        return value.lower()

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str | None) -> str | None:
        """Trim surrounding spaces, and treat an all-spaces name as no name."""
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, value: str) -> str:
        """max_length above counts characters; bcrypt counts bytes.

        Most characters are one byte, but an accented letter is two and an
        emoji is four. So a 72 character password can still be far more than
        72 bytes. This checks the measurement bcrypt actually uses.
        """
        if len(value.encode("utf-8")) > MAX_PASSWORD_LENGTH:
            raise ValueError(
                f"Password must be at most {MAX_PASSWORD_LENGTH} bytes. "
                "Accented letters and emoji count as more than one byte each."
            )
        return value


class UserLogin(BaseModel):
    """What someone must send to POST /auth/login.

    Only two fields. Note there is no length or pattern checking here: we are
    not creating anything, just comparing against what is stored. Rejecting a
    short password at this point would tell a stranger that short passwords
    do not exist in our database, which is information they should not get.
    """

    email: EmailStr = Field(..., examples=["john@example.com"])
    password: str = Field(..., examples=["correct-horse-battery"])

    @field_validator("email")
    @classmethod
    def email_to_lowercase(cls, value: str) -> str:
        """Must match the lowercasing done at signup, or the lookup fails."""
        return value.lower()


class UserOut(BaseModel):
    """What a user looks like when we send one back.

    THIS IS THE IMPORTANT ONE. password_hash is not listed, so it cannot be
    sent to a browser. Endpoints declare response_model=UserOut, which tells
    FastAPI to build the reply from these seven fields and throw away
    everything else -- even if the endpoint hands back the whole database row
    by mistake.

    Do not add password_hash to this class. Ever.
    """

    id: int
    username: str
    email: EmailStr
    full_name: str | None
    bio: str | None
    avatar_url: str | None
    created_at: datetime

    # By default Pydantic expects a dictionary. from_attributes=True lets it
    # read a normal Python object instead, taking user.id, user.username and
    # so on. That is what allows us to return a SQLAlchemy User straight from
    # an endpoint without converting it by hand first.
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    """What POST /auth/login sends back."""

    access_token: str

    # "bearer" means whoever holds this ticket is treated as its owner, like a
    # train ticket rather than a passport. It is a naming convention the
    # frontend relies on; the value is always the same.
    token_type: str = "bearer"


# ----------------------------------------------------------------------------
# Phase 5 -- posts and public profiles
# ----------------------------------------------------------------------------

MAX_IMAGE_URL_LENGTH = 500
MAX_CAPTION_LENGTH = 2200


class UserSummary(BaseModel):
    """A user as seen by OTHER people, in a small space.

    READ THIS ONE CAREFULLY. It exists because of what it leaves out.

    UserOut above contains the email address, which is correct for /auth/me:
    you are allowed to see your own email. But this schema is attached to
    every post, so it is shown to everybody. Reusing UserOut here would
    publish every user's email address to every other user of the site.

    Same principle as password_hash in Phase 3: decide once, in the schema,
    what is allowed to leave the building. Then it cannot leak by accident.

    Do not add email to this class.
    """

    id: int
    username: str
    full_name: str | None
    avatar_url: str | None

    model_config = ConfigDict(from_attributes=True)


class UserProfile(BaseModel):
    """A user's profile page, as seen by anybody.

    Like UserSummary but with the things a profile page shows: the bio, when
    they joined, and how many posts they have.

    Also deliberately has no email, for exactly the same reason.
    """

    id: int
    username: str
    full_name: str | None
    bio: str | None
    avatar_url: str | None
    created_at: datetime

    # All three counts are done with SELECT count(*) when asked, never stored
    # on the user row.
    #
    # PLAN.md section 6 explains why: a stored count drifts out of step with
    # reality. Someone deletes a post, the number does not go down, and the
    # app shows a lie that is very hard to trace. Counting is always correct.
    post_count: int

    # How many people follow THIS user.
    follower_count: int

    # How many people THIS user follows.
    #
    # Keeping these two straight is the whole difficulty of Phase 6. They come
    # from the same table read from opposite directions, and mixing them up is
    # the most likely bug in the phase.
    following_count: int

    # Am I -- the person asking -- following this user?
    #
    # This field is different in kind from the others. The counts are facts
    # about this user. This one is a fact about the VIEWER AND this user
    # together, so the same profile gives a different answer depending on who
    # asks for it.
    #
    # It exists so the Follow button knows whether to say "Follow" or
    # "Following" without needing a second request. Always false when you are
    # looking at your own profile.
    is_following: bool

    model_config = ConfigDict(from_attributes=True)


class PostCreate(BaseModel):
    """What someone must send to POST /posts.

    Notice what is NOT here: user_id.

    The author is taken from the login token, never from the request body. If
    the client could send user_id, anyone could post as anyone else simply by
    typing a different number. The rule for the rest of this project:
    identity comes from the token, never from what the browser sends.
    """

    image_url: str = Field(
        ...,
        min_length=1,
        max_length=MAX_IMAGE_URL_LENGTH,
        examples=["https://picsum.photos/600"],
    )

    caption: str | None = Field(
        default=None,
        max_length=MAX_CAPTION_LENGTH,
        examples=["my first post"],
    )

    @field_validator("image_url")
    @classmethod
    def must_be_a_web_link(cls, value: str) -> str:
        """Require a normal http or https web address.

        Two reasons. It catches typos early, with a clear message, instead of
        saving a broken link that shows as a grey box forever. And it blocks
        addresses beginning with javascript:, which would be dangerous if the
        value were ever used as a clickable link rather than an image.
        """
        cleaned = value.strip()

        if not cleaned.startswith(("http://", "https://")):
            raise ValueError(
                "Image link must start with http:// or https://"
            )

        return cleaned

    @field_validator("caption")
    @classmethod
    def clean_caption(cls, value: str | None) -> str | None:
        """Trim spaces, and treat an all-spaces caption as no caption."""
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class PostOut(BaseModel):
    """What a post looks like when we send one back.

    The author is nested inside as a UserSummary rather than a plain user_id,
    so the website can draw the name and avatar without a second request for
    every post on the screen.
    """

    id: int
    image_url: str
    caption: str | None
    created_at: datetime

    # This attribute is called "author" on the Post model, which is the
    # relationship added in Phase 5. from_attributes below is what lets
    # Pydantic follow it.
    author: UserSummary

    # --- Phase 8 -----------------------------------------------------------
    #
    # Counted when asked, never stored on the post row. PLAN.md section 6 is
    # explicit about this one:
    #
    #   "I am not storing a like_count number on each post... if I store the
    #    number separately, it can drift out of step with reality. Someone
    #    deletes a like but the number does not go down, and now my app shows
    #    a lie that is very hard to trace."
    like_count: int = 0
    comment_count: int = 0

    # Have I -- the person asking -- liked this post?
    #
    # Like is_following in Phase 6, this is a fact about the VIEWER AND the
    # post together, so the same post answers differently for different
    # people. It exists so the heart knows whether to start full or empty.
    is_liked: bool = False

    model_config = ConfigDict(from_attributes=True)


class CommentCreate(BaseModel):
    """What someone must send to POST /posts/{id}/comments.

    Only the text. Who wrote it comes from the token and which post it is
    under comes from the address, so neither can be chosen by the browser.
    """

    body: str = Field(..., min_length=1, max_length=2200, examples=["nice shot"])

    @field_validator("body")
    @classmethod
    def not_only_spaces(cls, value: str) -> str:
        """Trim, and refuse a comment that is nothing but whitespace.

        min_length=1 above would happily accept "   ", which looks like an
        empty comment on screen. This closes that.
        """
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Comment cannot be empty.")
        return cleaned


class CommentOut(BaseModel):
    """One comment, as sent back to the browser."""

    id: int
    body: str
    created_at: datetime

    # The author is nested as a UserSummary, which has no email -- the same
    # protection as post authors.
    author: UserSummary

    model_config = ConfigDict(from_attributes=True)

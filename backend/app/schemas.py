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

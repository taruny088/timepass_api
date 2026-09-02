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


def check_password_bytes(value: str) -> str:
    """Refuse a password longer than bcrypt will actually read.

    max_length on a field counts CHARACTERS; bcrypt counts BYTES. Most
    characters are one byte, but an accented letter is two and an emoji is
    four -- so a 72 character password can be far more than 72 bytes, and
    bcrypt silently ignores everything past the 72nd. Someone would think they
    had chosen a long password while only the first part of it protected
    anything.

    Written once here because Phase 13 adds three more places that accept a
    password -- signing up, changing one, and resetting one. Four copies of a
    rule is four chances for one of them to be forgotten, and the one that gets
    forgotten is the one an attacker finds.
    """
    if len(value.encode("utf-8")) > MAX_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must be at most {MAX_PASSWORD_LENGTH} bytes. "
            "Accented letters and emoji count as more than one byte each."
        )
    return value


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
        """See check_password_bytes above -- shared with the Phase 13 schemas."""
        return check_password_bytes(value)


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


class UserUpdate(BaseModel):
    """What someone may send to PATCH /users/me to edit their own profile.

    THE IMPORTANT THING ABOUT THIS CLASS IS WHAT IS MISSING.

    There is no username, no email, no password and no avatar_url. A schema is
    not just a description of good data -- it is the list of what the outside
    world is ALLOWED to change through this door. Anything absent here cannot
    be edited by this endpoint no matter what the browser sends, because
    Pydantic drops unknown fields before our code ever sees them.

    So a request saying {"bio": "hi", "password_hash": "..."} changes the bio
    and silently ignores the rest. That is the safe way round.

    Every field is optional, which is what makes this a PATCH rather than a
    PUT. PUT means "here is the whole record, replace it" -- anything left out
    gets wiped. PATCH means "here are the bits I changed, leave the rest
    alone". If the edit page only sends a bio, a PUT would blank the name.

    Optional alone is not enough to make that work, though. "full_name": null
    and leaving full_name out entirely both arrive here as None, and they mean
    opposite things -- "clear my name" and "do not touch my name". The
    endpoint tells them apart with exclude_unset, which is explained there.
    """

    # max_length matches String(100) on the User model. Two places to keep in
    # step, but they fail very differently: this one produces a polite message
    # about the limit, while the database one produces a 500 error. We want
    # the polite one to happen first.
    full_name: str | None = Field(default=None, max_length=100)

    bio: str | None = Field(default=None, max_length=200)

    @field_validator("full_name", "bio")
    @classmethod
    def blank_means_empty(cls, value: str | None) -> str | None:
        """Trim surrounding spaces, and treat an all-spaces value as nothing.

        One validator for both fields -- field_validator accepts several names.

        Why this matters: a text box the user cleared out sends "", and a text
        box they typed three spaces into sends "   ". Neither is a bio. Storing
        them as-is gives a profile with an invisible bio that still takes up
        space on the page and still counts as "having" one. Turning both into
        None means the profile page's "no bio yet" case works properly.
        """
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class UserOut(BaseModel):
    """What a user looks like when we send one back.

    THIS IS THE IMPORTANT ONE. password_hash is not listed, so it cannot be
    sent to a browser. Endpoints declare response_model=UserOut, which tells
    FastAPI to build the reply from these eight fields and throw away
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

    # Has this person confirmed their email address?
    #
    # Read straight off the User model's is_verified PROPERTY, not off a
    # column -- from_attributes below lets Pydantic take a value from any
    # attribute, and a property is an attribute.
    #
    # THIS IS IN UserOut AND DELIBERATELY NOT IN UserProfile. UserOut is your
    # own account and is only ever sent to you; UserProfile is what anybody can
    # see about anybody. Whether a stranger has confirmed their address is none
    # of your business, and publishing it would quietly mark out the newest and
    # least established accounts on the site.
    #
    # The frontend uses it for exactly one thing: whether to draw the "confirm
    # your email" banner. It enforces nothing -- the backend re-checks on every
    # request that matters, because anything sent to a browser can be edited
    # there.
    is_verified: bool

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


class MessageOut(BaseModel):
    """A plain sentence for the user, and nothing else.

    Used by the endpoints that do something rather than return something --
    confirming an address, asking for a new link. They have no object to hand
    back, and an empty reply leaves the frontend with nothing to display.

    Deliberately vague by design in some places. The password reset endpoint in
    step 3 will return the SAME message whether or not the email exists, so
    this class must never grow a field like "found" or "sent" -- that would put
    the answer back on the wire in a different shape.
    """

    detail: str


class VerifyEmailRequest(BaseModel):
    """The code from a confirmation link, sent back to be checked.

    A POST with the code in the BODY, not a GET with it in the address, and the
    reason is not tidiness.

    Mail apps, antivirus tools and corporate scanners quietly open links to
    check them for malware, before any human sees the message. Anything that
    happens on a GET can therefore happen without a person -- so a link that
    confirmed the address by being fetched would be spent by the scanner, and
    the real user would arrive to find their new link already used.

    So the emailed link opens a PAGE, and the page sends this. It also keeps
    the code out of the browser history and out of any server log that records
    addresses, which is where secrets in web addresses tend to end up.
    """

    token: str = Field(..., min_length=1, max_length=200)


class ChangePasswordRequest(BaseModel):
    """Changing your password while logged in.

    TWO FIELDS, AND THE FIRST ONE IS THE POINT.

    Being logged in is not enough to change a password. A borrowed unlocked
    laptop, or a token copied from a shared computer, would otherwise be enough
    to take the account permanently -- the thief sets a new password and the
    real owner is locked out of their own account.

    Asking for the current password means holding the session is not the same
    as holding the account. It is the rule CLAUDE.md sets, and it is the single
    cheapest protection in this whole phase.
    """

    current_password: str = Field(..., examples=["the-one-you-have-now"])

    # The new one is checked properly, because this is a password being CHOSEN.
    # current_password above has no length rules at all: it is only ever
    # compared against what is stored, and rejecting a short one early would
    # quietly confirm that short passwords do not exist here.
    new_password: str = Field(
        ...,
        min_length=MIN_PASSWORD_LENGTH,
        max_length=MAX_PASSWORD_LENGTH,
        examples=["correct-horse-battery"],
    )

    @field_validator("new_password")
    @classmethod
    def new_password_fits_bcrypt(cls, value: str) -> str:
        return check_password_bytes(value)


class ForgotPasswordRequest(BaseModel):
    """Asking for a reset link. One field, and a hard rule about the reply.

    THE REPLY MUST BE IDENTICAL whether or not the address is registered.

    Saying "no account with that email" turns this endpoint into a tool for
    checking which addresses have accounts here -- an ENUMERATION ATTACK. It is
    not a break-in on its own; it builds the list that a break-in starts from,
    and it also leaks who uses this site to anyone who asks.

    The rule is easy to state and easy to break by accident, because the
    obvious, helpful-feeling error message is exactly the wrong thing. It is
    enforced in the endpoint, not here.
    """

    email: EmailStr = Field(..., examples=["john@example.com"])

    @field_validator("email")
    @classmethod
    def email_to_lowercase(cls, value: str) -> str:
        """Must match the lowercasing done at signup, or the lookup silently
        finds nothing and a real user is told nothing is wrong."""
        return value.lower()


class ResetPasswordRequest(BaseModel):
    """The code from a reset link, plus the new password to set.

    No email address and no username. The code alone says whose account this
    is, because it was made for one user and nobody else was ever sent it.
    Accepting an address here as well would invite the mistake of trusting it.

    Note there is no current_password either, and that is the whole difference
    between this and ChangePasswordRequest: the person cannot supply it -- not
    knowing it is why they are here. Control of the email inbox stands in for
    it, which is exactly why the code has to be single-use and short-lived.
    """

    token: str = Field(..., min_length=1, max_length=200)

    new_password: str = Field(
        ...,
        min_length=MIN_PASSWORD_LENGTH,
        max_length=MAX_PASSWORD_LENGTH,
        examples=["correct-horse-battery"],
    )

    @field_validator("new_password")
    @classmethod
    def new_password_fits_bcrypt(cls, value: str) -> str:
        return check_password_bytes(value)


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


class ConversationCreate(BaseModel):
    """Who you want to talk to.

    A USERNAME, NOT A USER ID. Ids are an internal detail: the browser knows
    usernames, because that is what is in the address of every profile page.
    Taking an id here would mean every screen had to look one up first.

    Note what is NOT here: your own identity. That comes from the token, as it
    does everywhere else. If the browser could name the sender, anyone could
    start a conversation as somebody else.
    """

    username: str = Field(..., min_length=1, max_length=30, examples=["john_23"])

    @field_validator("username")
    @classmethod
    def username_to_lowercase(cls, value: str) -> str:
        """Usernames are stored lowercase since Phase 3, so a search for
        "John_23" against a stored "john_23" would find nobody and wrongly
        report that the user does not exist."""
        return value.lower()


class ChatMessageCreate(BaseModel):
    """The text of one message.

    NAMED ChatMessage RATHER THAN Message, and it is worth saying why rather
    than leaving it to look like a clumsy name.

    Phase 13 already has a MessageOut in this file, holding a single sentence
    for the user -- "your password has been changed". That is a message in the
    English sense. This is a message in the chat sense. Two different things
    that want the same word, so the newer one takes the longer name rather than
    renaming something that is working and referred to from three files.
    """

    # min_length=1 after stripping, so a message of pure spaces is refused. An
    # empty bubble in a chat is a thing nobody can explain and nobody can
    # delete.
    body: str = Field(..., min_length=1, max_length=2000, examples=["hey"])

    @field_validator("body")
    @classmethod
    def strip_and_require_content(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("A message cannot be empty.")
        return cleaned


class ChatMessageOut(BaseModel):
    """One message, as the browser sees it."""

    id: int

    # Which thread it belongs to. The chat screen already knows, but the live
    # connection in 16c does not: one socket carries messages for every
    # conversation you are in, so each one has to say where it goes.
    conversation_id: int

    # WHO WROTE IT, as an id rather than a whole user object.
    #
    # The chat screen only needs to answer one question about the sender: was
    # it me? That decides which side of the screen the bubble sits on. Sending
    # the full user with every message would repeat the same name and avatar a
    # hundred times down one screen.
    sender_id: int

    body: str
    created_at: datetime

    # NULL until the other person has opened the conversation. This is what a
    # read receipt is drawn from, and what the unread badge counts.
    read_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ConversationOut(BaseModel):
    """One row of the conversation list, and the header of a chat screen."""

    id: int

    # THE OTHER PERSON, never both. A conversation has two people in it and you
    # are always one of them, so sending your own name back with every row
    # would be repeating what the app already knows.
    other_user: UserSummary

    # The most recent message, for the preview line. None for a conversation
    # that has just been created and has nothing in it yet -- which is a real
    # state, not a bug: the endpoint that starts a chat does not send anything.
    last_message: ChatMessageOut | None = None

    # How many messages in this thread the OTHER person sent that you have not
    # read. Counted with a query, never stored -- the same rule as follower
    # counts in PLAN.md. A stored count drifts, and a badge showing a number
    # that does not match what is inside is worse than no badge.
    unread_count: int = 0

    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UnreadCountOut(BaseModel):
    """The number for the badge on the messages icon.

    CONVERSATIONS, NOT MESSAGES, and that is a copy of what Instagram does.

    If one person sends you five messages, this says 1, not 5. The badge is
    answering "how many chats want your attention", and a 5 there would send
    you looking for five conversations when there is only one. The per-chat
    number in the inbox counts messages, because there the question really is
    "how much have I got to catch up on in this thread".

    Its own tiny endpoint rather than a field on something bigger, because the
    header needs it on every screen in the app and must not download the whole
    inbox to draw one number.
    """

    unread_conversations: int


class PostCreate(BaseModel):
    """The text part of POST /posts.

    THE PHOTO IS NOT IN HERE ANY MORE.

    Until Phase 12 this carried an image_url that someone had pasted. A real
    photo is not text, so it cannot travel in JSON -- it arrives as a file in a
    multipart request instead, and FastAPI hands it over separately as an
    UploadFile. See posts.py.

    This class is kept for the caption alone, so the length limit and the
    trimming rule still live with all the other validation rather than being
    written out by hand in the endpoint.

    Notice what is still NOT here: user_id. The author is taken from the login
    token, never from the request body. If the client could send user_id,
    anyone could post as anyone else simply by typing a different number.
    """

    caption: str | None = Field(
        default=None,
        max_length=MAX_CAPTION_LENGTH,
        examples=["my first post"],
    )

    @field_validator("caption")
    @classmethod
    def clean_caption(cls, value: str | None) -> str | None:
        """Trim spaces, and treat an all-spaces caption as no caption."""
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class PostMediaOut(BaseModel):
    """One photo inside a post.

    position is included rather than left implied by the order of the list.
    The list IS already in order -- the model sorts by position -- but sending
    the number makes that a fact the website can rely on instead of a happy
    accident, and a carousel needs it to label "3 of 5".
    """

    url: str
    position: int

    model_config = ConfigDict(from_attributes=True)


class PostOut(BaseModel):
    """What a post looks like when we send one back.

    The author is nested inside as a UserSummary rather than a plain user_id,
    so the website can draw the name and avatar without a second request for
    every post on the screen.
    """

    id: int

    # The photos, in order, always a list even when there is only one.
    #
    # A LIST EVEN FOR ONE PHOTO is deliberate. The alternative -- a single url
    # when there is one and a list when there are several -- means every screen
    # that draws a post has to check which shape it received. One shape, always,
    # and the website simply draws media[0] when it wants the first.
    media: list[PostMediaOut]

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

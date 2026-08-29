"""
Password scrambling and login tickets.

This file is deliberately self-contained. It does not import FastAPI and it
does not import the database. Everything in here is a plain function that
takes values and returns values, which means you can open a Python shell and
test the whole file with no server running and no PostgreSQL running.

Two jobs live here:

  1. Turning a password into a hash, and checking a password against a hash.
  2. Making a signed token that says "this is user 7", and reading it back.
"""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import jwt
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is missing from backend/.env. Generate one with:\n"
        '    python -c "import secrets; print(secrets.token_hex(32))"'
    )

# The signing method. HS256 means one single secret key both creates and
# checks the signature. The alternative family (RS256) uses a private key to
# sign and a public key to check, which matters when a different organisation
# needs to verify your tokens. Here the same server does both, so HS256 is the
# right fit and the simpler one.
ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))

# bcrypt ignores everything past the 72nd byte of a password. That is a silent
# limit with no warning, so a 200 character password and its first 72
# characters would unlock the same account. We refuse anything longer instead
# of quietly accepting a weaker password than the user believed they chose.
MAX_PASSWORD_BYTES = 72


# ----------------------------------------------------------------------------
# Passwords
# ----------------------------------------------------------------------------

def hash_password(plain_password: str) -> str:
    """Scramble a password so it can be stored.

    The result is a 60 character string starting with $2b$. It contains the
    random salt as well as the hash, which is why two users with the same
    password still end up with completely different stored values.
    """
    password_bytes = plain_password.encode("utf-8")

    if len(password_bytes) > MAX_PASSWORD_BYTES:
        raise ValueError(
            f"Password must be at most {MAX_PASSWORD_BYTES} bytes."
        )

    # gensalt() produces fresh random salt every single call, so calling this
    # function twice with the same password gives two different hashes. That
    # is correct and expected.
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Check a typed password against a stored hash.

    Nothing is ever unscrambled. bcrypt reads the salt out of the stored hash,
    scrambles the typed password the same way, and compares the two results.
    """
    password_bytes = plain_password.encode("utf-8")

    # A too-long password can never be one we stored, because hash_password
    # refuses them. Returning False is simpler than raising here, since the
    # caller only ever wants a yes or no.
    if len(password_bytes) > MAX_PASSWORD_BYTES:
        return False

    try:
        return bcrypt.checkpw(password_bytes, password_hash.encode("utf-8"))
    except ValueError:
        # The stored value is not a real bcrypt hash. That should be
        # impossible, but a corrupt row must not crash a login attempt.
        return False


# A real bcrypt hash of a throwaway password, generated once when this file is
# first imported.
#
# It exists for one reason. When someone tries to log in with an email that
# has no account, there is no hash to check, so the answer comes back
# instantly -- while a wrong password on a REAL account takes bcrypt about a
# tenth of a second. A stranger could time the two and learn which emails have
# accounts, which is exactly what our deliberately vague error message is
# trying to hide. Checking against this dummy hash makes both paths take
# roughly the same time.
DUMMY_PASSWORD_HASH = hash_password("not-a-real-password")


def waste_time_like_a_real_check() -> None:
    """Spend the same time a genuine password check would spend.

    Called when the email does not exist, so that a failed login takes the
    same time whether the account is real or not.
    """
    bcrypt.checkpw(b"not-a-real-password", DUMMY_PASSWORD_HASH.encode("utf-8"))


# ----------------------------------------------------------------------------
# Tokens
# ----------------------------------------------------------------------------

def create_access_token(user_id: int) -> str:
    """Build a signed ticket saying which user this is.

    The result has three parts separated by dots: header, payload, signature.
    The first two are only base64 encoded, NOT encrypted -- anyone holding the
    token can read them. Never put anything secret in here. A user id and an
    expiry time are fine, because the user already knows both.
    """
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        # "sub" is short for subject: who this token is about. The JWT
        # specification requires it to be a string, so we convert the id.
        "sub": str(user_id),
        # "exp" is the expiry time. The jwt library checks this automatically
        # when decoding and refuses anything past it, so we never have to
        # compare dates ourselves.
        "exp": expires_at,
        # "iat" is issued-at. Not required, but useful when debugging to see
        # exactly when a token was created.
        "iat": now,
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> int | None:
    """Read a token and return the user id inside it, or None if unusable.

    Returns None for every kind of bad token: tampered with, signed by someone
    else, expired, or malformed. The caller does not need to know which,
    because the answer to all of them is the same -- refuse the request.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        # This one exception class covers expired tokens, bad signatures and
        # malformed strings. Anything we cannot fully trust lands here.
        return None

    user_id = payload.get("sub")

    if user_id is None:
        return None

    try:
        return int(user_id)
    except ValueError:
        # "sub" held something that is not a number. Not a token we made.
        return None

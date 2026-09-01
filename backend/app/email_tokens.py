"""One-time codes sent by email: making them, and redeeming them.

Two jobs use this file and nothing else does:

    verify_email     prove the address on a new account is real
    password_reset   let somebody back in who has forgotten their password

They are the same machinery. Both make a long random code, email it, and later
check that the code coming back is genuine, unexpired and unused. Only what
happens AFTER a successful check differs, and that part lives in account.py.

THE THREE RULES, AND WHY EACH ONE IS SEPARATELY NECESSARY.

  Stored hashed   The database holds a scrambled copy, never the code. A
                  stolen dump of email_tokens is then worthless -- it cannot
                  be turned back into working links.

  Expires         An old link sitting in an inbox next year must be dead.

  Used once       A link that has already done its job must be dead too, so
                  forwarding the email, or a leak of it, achieves nothing.

None of the three substitutes for another. Expiry alone leaves a link live for
an hour to anybody who can see the mailbox. Single use alone leaves an unused
link working forever. Hashing alone protects the database and does nothing
about the email itself.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EmailToken, User

# The two jobs, written down once so a typo becomes an import error rather
# than a code that silently never matches anything.
PURPOSE_VERIFY_EMAIL = "verify_email"
PURPOSE_PASSWORD_RESET = "password_reset"

# HOW LONG EACH KIND OF CODE LIVES, AND WHY THEY DIFFER.
#
# A reset code is the more dangerous of the two: anyone holding it can take the
# account. CLAUDE.md sets the rule at an hour, and an hour is plenty -- somebody
# resetting a password is sitting at their computer doing it now.
#
# A verification link is far less dangerous. The worst it can do is mark an
# address confirmed. It is also often clicked much later, on a phone, hours
# after signing up on a laptop. Twenty-four hours matches that, and every hour
# shaved off it just produces people clicking dead links.
VERIFY_EMAIL_HOURS = 24
PASSWORD_RESET_HOURS = 1


def _hash_token(raw_token: str) -> str:
    """Scramble a code the same way every time, so it can be looked up.

    SHA-256 turns any text into the same 64-character fingerprint every time,
    and there is no way back from the fingerprint to the text.

    WHY NOT BCRYPT, WHICH IS WHAT PASSWORDS USE. Two reasons:

      bcrypt is deliberately slow, and slowness is what stops somebody guessing
      a short human-chosen password. This code is 32 random bytes. Guessing it
      is not a thing that happens, so slowness buys nothing and only makes
      every click of a link take longer.

      bcrypt mixes in a different random salt each time, so the same code
      hashes to a different value on every run. That is exactly right for
      passwords -- and it would make this impossible, because we could not LOOK
      THE CODE UP. Redeeming a link would mean fetching every row in the table
      and testing them one at a time.

    So: hashed, as CLAUDE.md requires, with the hash that fits the job. The
    property that matters -- a stolen database yields no working links -- holds
    either way.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _now() -> datetime:
    """The current moment, with its timezone attached.

    datetime.now() with no argument gives a bare wall-clock reading with no
    country attached, and comparing one of those against a timezone-aware value
    from the database raises TypeError. Every column in this project stores UTC
    (see models.py), so everything read back is aware, and everything we
    compare it to has to be as well.
    """
    return datetime.now(timezone.utc)


def create_token(db: Session, user: User, purpose: str) -> str:
    """Make a new code for this user and this purpose, and return the RAW one.

    The raw code is returned and never stored. It exists in memory here, goes
    straight into an email, and after that only the person holding the email
    has it. Exactly the arrangement used for passwords.

    ANY EARLIER UNUSED CODE FOR THE SAME JOB IS RETIRED FIRST.

    Without that, pressing "resend" three times would leave three live links,
    and the two older ones would keep working long after the person stopped
    thinking about them. Most people assume a new link replaces the old one,
    and an app that quietly disagrees is an app with more live keys floating
    around than anybody realises. It also blunts a slow guessing attempt: only
    ever one target at a time.
    """
    now = _now()

    # Retire everything outstanding for this user and this purpose. A reset
    # code does not disturb a pending verification, and vice versa -- they are
    # different jobs and someone may reasonably have one of each.
    outstanding = db.scalars(
        select(EmailToken).where(
            EmailToken.user_id == user.id,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
        )
    ).all()
    for old in outstanding:
        old.used_at = now

    # token_urlsafe(32) is 32 bytes from the operating system's cryptographic
    # random source, written in letters, digits, - and _ so it survives being
    # pasted into a web address.
    #
    # NOT random.random(), and this is the single most important line in the
    # file. The `random` module is built for simulations and shuffling: it is
    # fast, repeatable, and its next value can be worked out by anyone who has
    # seen enough previous ones. `secrets` exists for exactly this job and is
    # the only correct choice for anything a stranger must not be able to
    # predict.
    #
    # 32 bytes is about 256 bits. There is no meaningful chance of guessing one.
    raw_token = secrets.token_urlsafe(32)

    if purpose == PURPOSE_VERIFY_EMAIL:
        hours = VERIFY_EMAIL_HOURS
    else:
        hours = PASSWORD_RESET_HOURS

    db.add(
        EmailToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=_hash_token(raw_token),
            expires_at=now + timedelta(hours=hours),
        )
    )
    db.commit()

    return raw_token


def use_token(db: Session, raw_token: str, purpose: str) -> User | None:
    """Check a code and spend it. Returns the user it belonged to, or None.

    Returns None for every kind of failure -- never made, wrong job, expired,
    already used -- rather than saying which. The person clicking a broken link
    can do exactly one thing about it either way, which is ask for a new one,
    so the distinction helps nobody legitimate and tells anyone probing the
    endpoint whether a code they hold is real.

    THE FOUR CHECKS, ALL OF WHICH MATTER.
    """
    now = _now()

    # 1. Does it exist at all? Looked up by the HASH, because the raw code was
    #    never stored. Same input, same fingerprint, every time -- which is the
    #    property bcrypt deliberately lacks.
    token = db.scalars(
        select(EmailToken).where(EmailToken.token_hash == _hash_token(raw_token))
    ).first()

    if token is None:
        return None

    # 2. Is it for the job being asked of it?
    #
    #    THIS CHECK IS NOT A FORMALITY. A verification code is emailed to an
    #    address nobody has yet proved they own -- that is the entire point of
    #    sending it. Without this line, someone signing up with a stranger's
    #    email address, then feeding the resulting code to the password-reset
    #    endpoint instead, would take over that stranger's account. The two
    #    codes are indistinguishable to look at; this column is the only thing
    #    that says which door each one opens.
    if token.purpose != purpose:
        return None

    # 3. Has it already been spent?
    if token.used_at is not None:
        return None

    # 4. Has it run out of time?
    if token.expires_at <= now:
        return None

    # Spend it. Stamped, not deleted -- a deleted row cannot tell the
    # difference between "already used" and "never existed", and those two
    # deserve different explanations when somebody says their link did not work.
    #
    # Stamped BEFORE the caller acts on the result, and committed here, so the
    # code is dead even if whatever follows goes wrong. Better a spent code and
    # a failed action, which a resend fixes, than a completed action and a code
    # still live for the next person who finds the email.
    token.used_at = now
    db.commit()

    return db.get(User, token.user_id)

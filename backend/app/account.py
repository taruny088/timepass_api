"""Looking after your own account: confirming your email address.

WHY A SEPARATE FILE FROM auth.py.

auth.py answers "who are you" -- signing up, logging in, and reporting who the
token belongs to. This file is about maintaining an account that already
exists. They share the /auth prefix because that is where a browser expects to
find them, but they are different jobs, and auth.py is long enough already.

Step 3 of this phase adds change-password, forgot-password and reset-password
here. They reuse email_tokens.py completely unchanged -- the machinery below is
built once and pointed at a second job.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.email_tokens import PURPOSE_VERIFY_EMAIL, create_token, use_token
from app.mailer import APP_URL, EMAIL_ENABLED, EmailResult, send_email
from app.models import User
from app.schemas import MessageOut, VerifyEmailRequest

router = APIRouter(prefix="/auth", tags=["account"])


def send_verification_email(db: Session, user: User) -> EmailResult:
    """Make a fresh confirmation code for this user and email it to them.

    Lives here rather than in auth.py because signup is not the only thing that
    needs it -- the resend button below does too, and one day so will changing
    your email address. Written twice, the two copies would eventually disagree
    about the wording or, worse, about the link.

    NOTE WHAT IS EMAILED: the raw code, which exists nowhere else. The database
    has only its fingerprint (see email_tokens.py), so nobody -- including
    whoever runs this server -- can read a live link out of it afterwards.
    """
    raw_token = create_token(db, user, PURPOSE_VERIFY_EMAIL)

    # The link points at the WEBSITE, not at this API. mailer.py explains why
    # in full; the short version is that a link to the backend would show raw
    # JSON, and that anything reachable by simply fetching a web address gets
    # fetched by spam filters before a human sees it.
    link = f"{APP_URL}/verify-email?token={raw_token}"

    return send_email(
        to=user.email,
        subject="Confirm your email address",
        body=(
            f"Hello {user.username},\n\n"
            "Welcome to Timepass. Confirm your email address by opening this "
            "link:\n\n"
            f"{link}\n\n"
            "The link works once and expires in 24 hours.\n\n"
            "If you did not create this account you can ignore this message; "
            "nothing will happen until the link is opened.\n"
        ),
    )


@router.post(
    "/verify-email",
    response_model=MessageOut,
    summary="Confirm an email address using the code from the link",
)
def verify_email(
    payload: VerifyEmailRequest,
    db: Session = Depends(get_db),
) -> MessageOut:
    """Spend a confirmation code and mark the address confirmed.

    THIS ENDPOINT IS DELIBERATELY PUBLIC -- no token, no login.

    The link is very often opened on a phone while the account was created on a
    laptop, so requiring a login would strand exactly the people it is meant to
    help. It is safe to leave open because the code IS the proof: it went to
    that address and nowhere else, and holding it is the whole thing being
    demonstrated.

    ALREADY-CONFIRMED IS TREATED AS SUCCESS, not as an error. Somebody who taps
    the link twice, or whose mail app prefetched it, has done nothing wrong and
    their address is confirmed either way. Showing them a failure would send
    them looking for a problem that does not exist.
    """
    # One call does all four checks -- exists, right purpose, unused, in date --
    # and spends the code. None means it failed, without saying which check,
    # because the answer would only ever help somebody probing the endpoint.
    user = use_token(db, payload.token, PURPOSE_VERIFY_EMAIL)

    if user is None:
        return MessageOut(
            detail=(
                "That link is not valid any more. It may have expired or "
                "already been used. Log in and ask for a new one."
            )
        )

    # Only write if it is not already set. Overwriting would move the date
    # forward on a second click and lose the moment it actually happened.
    #
    # timezone.utc, not a bare datetime.now(). A bare one is a wall-clock
    # reading with no country attached, and this column stores an absolute
    # moment -- see the note on created_at in models.py.
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(timezone.utc)
        db.commit()

    return MessageOut(detail="Your email address is confirmed.")


@router.post(
    "/resend-verification",
    response_model=MessageOut,
    status_code=status.HTTP_200_OK,
    summary="Send a fresh confirmation link to your own address",
)
def resend_verification(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageOut:
    """Email a new confirmation link to the logged-in user.

    get_current_user, NOT get_verified_user. Obvious once said aloud, and an
    easy mistake to make while adding the new gate everywhere: requiring a
    confirmed address in order to ask for the link that confirms your address
    would leave anyone who lost the first email permanently stuck.

    There is no way to name a user here. It always sends to the address on the
    account the token belongs to, so it cannot be used to fire mail at a
    stranger's inbox.

    Making a new code retires any earlier unused one -- see create_token. So
    the old link stops working the moment a new one is sent, which is what
    people assume happens anyway.
    """
    if current_user.is_verified:
        # Not an error. Nothing is wrong, there is simply nothing to do, and
        # sending another link would be confusing.
        return MessageOut(detail="Your email address is already confirmed.")

    result = send_verification_email(db, current_user)

    # THREE OUTCOMES, THREE DIFFERENT SENTENCES. This endpoint used to have
    # one, and said it regardless of what actually happened.
    #
    # No key configured. Nothing was sent and nothing is wrong -- the link went
    # to the server's own terminal. Telling somebody to check their inbox here
    # sends them to wait for something that is never coming.
    if not EMAIL_ENABLED:
        return MessageOut(
            detail=(
                "Email is not configured on this server, so nothing was sent. "
                "The confirmation link has been printed to the backend's "
                "terminal instead -- copy it from there."
            )
        )

    # The provider refused it. THIS IS THE CASE THAT WAS INVISIBLE: the send
    # failed, was logged, and the user was told it was on its way regardless.
    #
    # The reason is not repeated here on purpose. A provider's error names
    # settings and addresses belonging to whoever runs the server, not to
    # whoever is reading the screen -- so the sentence points at the log rather
    # than quoting it. mailer.py prints the full text there, in a block.
    if not result.sent:
        return MessageOut(
            detail=(
                "The email could not be sent. This is a problem with the "
                "server's email settings, not with your account -- the exact "
                "reason is in the server log."
            )
        )

    return MessageOut(
        detail=f"A new confirmation link is on its way to {current_user.email}."
    )

"""Looking after your own account: confirming your email address.

WHY A SEPARATE FILE FROM auth.py.

auth.py answers "who are you" -- signing up, logging in, and reporting who the
token belongs to. This file is about maintaining an account that already
exists. They share the /auth prefix because that is where a browser expects to
find them, but they are different jobs, and auth.py is long enough already.

Step 3 added change-password, forgot-password and reset-password, and it reused
email_tokens.py WITHOUT CHANGING A LINE OF IT. That was the bet made when this
phase was planned -- that confirming an address and resetting a password are the
same machinery pointed at two jobs -- and it paid off. The only new code below is
what happens after a code checks out.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.email_tokens import (
    PURPOSE_PASSWORD_RESET,
    PURPOSE_VERIFY_EMAIL,
    create_token,
    use_token,
)
from app.mailer import APP_URL, EMAIL_ENABLED, EmailResult, send_email
from app.models import User
from app.security import hash_password, verify_password
from app.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    MessageOut,
    ResetPasswordRequest,
    VerifyEmailRequest,
)

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


def send_password_reset_email(
    db: Session, user: User, background_tasks: BackgroundTasks
) -> None:
    """Make a reset code for this user and QUEUE the email.

    The result is deliberately thrown away, unlike the verification send. The
    endpoint calling this must reply identically whether or not the address
    exists, so it cannot report a send failure without also revealing that
    there was somebody to send to. The failure is still printed in full to the
    server log by mailer.py, which is the right place for it here.

    WHY THE SEND IS QUEUED RATHER THAN DONE HERE. A BackgroundTask is work
    FastAPI runs after the reply has already gone back to the browser. Calling
    Resend takes a few hundred milliseconds because it is a request across the
    internet, and doing it inline would make this endpoint take that long for a
    registered address and almost no time for an unregistered one.

    That difference is the whole enumeration leak coming back in through a side
    door -- not in WHAT is said, which is identical, but in HOW LONG IT TAKES,
    which anybody can measure with a stopwatch. Queueing means both answers
    come back after the same trivial amount of work.
    """
    raw_token = create_token(db, user, PURPOSE_PASSWORD_RESET)

    link = f"{APP_URL}/reset-password?token={raw_token}"

    background_tasks.add_task(
        send_email,
        to=user.email,
        subject="Reset your password",
        body=(
            f"Hello {user.username},\n\n"
            "Somebody asked to reset the password on your Timepass account. "
            "If it was you, open this link to choose a new one:\n\n"
            f"{link}\n\n"
            "The link works once and expires in an hour.\n\n"
            "If it was not you, ignore this message. Your password has not "
            "changed, and nobody can change it without this link.\n"
        ),
    )


@router.post(
    "/change-password",
    response_model=MessageOut,
    summary="Change your password, knowing the current one",
)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageOut:
    """Change the logged-in user's password.

    THE CURRENT PASSWORD IS REQUIRED, and being logged in is not a substitute
    for it. A borrowed unlocked laptop would otherwise be enough to take the
    account permanently: set a new password, and the real owner is locked out
    with no way back except the reset flow below.

    get_current_user, not get_verified_user. Somebody who has not confirmed
    their address still owns their password, and blocking them from changing it
    would punish them for an unrelated thing.
    """
    if not verify_password(payload.current_password, current_user.password_hash):
        # 403, not 401. We know exactly who this is and their token is fine.
        # A 401 would make the frontend assume the login had expired and send
        # them to log in again, which fixes nothing and hides the real cause.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="That is not your current password.",
        )

    # Reject a change that changes nothing. Not a security rule -- it is almost
    # always a mis-paste, and reporting success would leave somebody believing
    # they had rotated a password they had not.
    if payload.new_password == payload.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The new password must be different from the current one.",
        )

    current_user.password_hash = hash_password(payload.new_password)
    db.commit()

    # WORTH KNOWING, AND DELIBERATELY NOT FIXED HERE. Changing a password does
    # not log anybody else out. A JWT cannot be cancelled by the server -- there
    # is no list of issued tokens to cross off, which is the whole point of the
    # design -- so a token somebody else already holds keeps working until it
    # expires. ACCESS_TOKEN_EXPIRE_MINUTES is 15, so that window is short.
    # Closing it properly needs a token version on the user row and a check on
    # every request. That is a real feature, not a line of code, and nothing in
    # PLAN2.md asks for it.
    return MessageOut(detail="Your password has been changed.")


@router.post(
    "/forgot-password",
    response_model=MessageOut,
    summary="Ask for a password reset link",
)
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> MessageOut:
    """Email a reset link, if that address has an account.

    THE ONE RULE THAT MATTERS: the reply is identical either way.

    Saying "no account with that email" would turn this endpoint into a tool
    for testing which addresses are registered -- an ENUMERATION ATTACK. Not a
    break-in by itself; it builds the list a break-in starts from, and it leaks
    who uses this site to anybody who cares to ask.

    The trap is that the helpful-feeling message is the wrong one. So the single
    reply is built FIRST and returned from both paths. Written as two different
    returns in two branches, somebody eventually improves one of them and the
    leak quietly comes back.

    THE SECOND HALF OF THE RULE, WHICH IS EASY TO MISS: the two answers must
    also take the SAME AMOUNT OF TIME. Identical wording is worthless if a
    registered address takes half a second and an unregistered one comes back
    instantly, because the stopwatch then answers the question the words
    refused to. That is called a timing attack.

    This was got WRONG here first, in a way worth recording. The first version
    called waste_time_like_a_real_check() on the unknown branch, copying what
    auth.py does at login. At login that is right: the real path runs bcrypt,
    which takes about half a second, so the decoy has to run bcrypt too.

    Here the real path runs no bcrypt at all -- it writes a row and sends an
    email. So the decoy was fifty times SLOWER than the thing it was imitating,
    and the timing signal was not merely still present but inverted and far
    louder than before: a fast reply meant the account existed.

    The lesson is that a constant-time defence has to be measured, not
    reasoned about. Copying the shape of one from elsewhere in the codebase is
    exactly how you get a comment claiming a protection that is not there.

    The fix is to make both branches genuinely cheap: the slow part, the call
    across the internet to Resend, is queued and happens after the reply has
    already been sent.
    """
    same_answer_either_way = MessageOut(
        detail=(
            "If that email address has an account, a reset link is on its way. "
            "Check your spam folder if it does not arrive."
        )
    )

    user = db.scalars(select(User).where(User.email == payload.email)).first()

    if user is None:
        return same_answer_either_way

    send_password_reset_email(db, user, background_tasks)

    return same_answer_either_way


@router.post(
    "/reset-password",
    response_model=MessageOut,
    summary="Set a new password using the code from a reset link",
)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> MessageOut:
    """Spend a reset code and set the new password.

    PUBLIC, like verify-email, and for a stronger reason: somebody who has
    forgotten their password cannot log in, so requiring a login would make the
    feature impossible to use.

    The code stands in for the password, which is why every rule in
    email_tokens.py earns its place at once here. Hashed, so a stolen database
    yields no working links. Expires within the hour. Works exactly once, so a
    forwarded or leaked email is worthless afterwards.
    """
    user = use_token(db, payload.token, PURPOSE_PASSWORD_RESET)

    if user is None:
        # 400 rather than a cheerful 200. Unlike a duplicate verification click,
        # this genuinely failed and the person has to do something about it.
        # It still says nothing about WHICH check failed.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "That link is not valid any more. It may have expired or "
                "already been used. Ask for a new one."
            ),
        )

    user.password_hash = hash_password(payload.new_password)
    db.commit()

    # NOT also marked email-verified here, even though clicking this link does
    # prove control of the inbox. It is a defensible thing to do, it is not what
    # PLAN2.md asks for, and quietly widening what an endpoint does beyond what
    # its name says is how a codebase stops being predictable.
    return MessageOut(
        detail="Your password has been reset. You can log in with it now."
    )

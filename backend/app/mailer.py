"""Sending email.

WHY AN OUTSIDE SERVICE, AND NOT JUST SENDING IT OURSELVES.

Every computer can technically send email. Almost none can send email that
arrives. Whether a message reaches an inbox or a spam folder is decided by the
receiving side, based on the reputation of the address and the machine it came
from -- and a fresh server on a shared hosting platform has no reputation at
all, which is treated as bad reputation.

Resend is a TRANSACTIONAL EMAIL service: a company whose whole job is
delivering one-off automated messages -- receipts, verification links, reset
links -- and who maintain that reputation for us. "Transactional" distinguishes
it from marketing mail: it is sent because a person just did something, to one
person, and they are expecting it.

WHAT HAPPENS WITHOUT A KEY, AND WHY THAT IS DELIBERATE.

If RESEND_API_KEY is not set, this file prints the message to the terminal
instead of sending it, and says clearly that it did so.

That is not a fallback added out of laziness. Without it the whole of this
phase would be impossible to build or test: no key means signup would fail,
and there would be no way to see the verification link at all. It also means
this project can be cloned and run by somebody who has no email account set
up, and everything still works end to end -- they read the link off the
terminal instead of out of an inbox.

The rule is that it must be LOUD. A silent no-op that pretends to have sent
mail is far worse than no feature at all, because the failure only surfaces
when a real user is waiting for an email that was never sent.
"""

import os

import resend

# Loaded once when this file is first imported.
#
# None means "no key configured", which is the console-printing mode described
# above. Empty string counts as None: an environment variable that exists but
# was left blank is a mistake, not a choice.
RESEND_API_KEY = os.getenv("RESEND_API_KEY") or None

# Who the mail appears to come from.
#
# WITHOUT YOUR OWN DOMAIN this must stay as Resend's shared test sender, and it
# comes with a hard limit worth knowing before you wonder why a friend never
# got their link: onboarding@resend.dev will only deliver to the email address
# the Resend account itself is registered to. Mail to anyone else is accepted
# by the API, reports success, and is quietly dropped.
#
# That is a restriction of the free test sender, not a bug in this code. Owning
# a domain and verifying it with Resend is what lifts it.
EMAIL_FROM = os.getenv("EMAIL_FROM") or "Timepass <onboarding@resend.dev>"

# The address of the WEBSITE -- not the backend.
#
# Every link we email points at a page in the React app, which then talks to
# the API. Two reasons, and the second one is the one that bites:
#
#   A link straight to the backend would dump raw JSON on the screen, which
#   looks broken to anybody who clicks it.
#
#   Mail apps, antivirus tools and corporate scanners QUIETLY OPEN LINKS to
#   check them for malware, before any human sees the message. If merely
#   opening the link were what consumed the code, the scanner would burn it and
#   the real user would arrive to find their brand-new link already used.
#   Sending them to a page that then makes the request avoids that.
#
# This is a separate setting from FRONTEND_ORIGIN even though they often hold
# the same address, because FRONTEND_ORIGIN is a LIST of origins CORS should
# trust -- and on a deployed site it usually starts with localhost. Picking the
# first entry of that list would email everybody a link to their own computer.
APP_URL = (os.getenv("APP_URL") or "http://localhost:5173").rstrip("/")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def send_email(to: str, subject: str, body: str) -> None:
    """Send one plain-text email, or print it if there is no key.

    Deliberately knows nothing about verification or password resets. It takes
    an address, a subject and some words. Everything about WHY the mail is
    being sent lives in the file that calls this, so swapping Resend for
    something else later means changing this one file and nothing else.

    NEVER RAISES. If sending fails, it logs and returns.

    That is a real decision and worth understanding, because the obvious
    alternative is wrong. If this raised, a failure at Resend would turn into a
    failed signup: the account row is created, the email throws, FastAPI
    returns a 500, and the person is told signup did not work when in fact it
    did -- so they try again and are told the username is taken. One outage at
    somebody else's company would lock people out of registering.

    Failing to send is recoverable: there is a "resend" button. Failing to
    create the account is not.
    """
    if RESEND_API_KEY is None:
        # The loud console fallback. Printed as a block so it cannot be
        # mistaken for an ordinary log line and scrolled past.
        print("=" * 70)
        print("NO EMAIL SENT -- RESEND_API_KEY is not set.")
        print("This message would have gone to:", to)
        print("Subject:", subject)
        print("-" * 70)
        print(body)
        print("=" * 70, flush=True)
        return

    try:
        resend.Emails.send(
            {
                # "from" is a reserved word in Python, so it cannot be written
                # as a keyword argument. A dictionary has no such problem,
                # which is why this library takes one.
                "from": EMAIL_FROM,
                # A list, because the API supports several recipients. We only
                # ever send to one: these messages are private to one person,
                # and a second address on the line would hand them somebody
                # else's reset link.
                "to": [to],
                "subject": subject,
                "text": body,
            }
        )
    except Exception as error:
        # Broad on purpose. Anything from an expired key to a network timeout
        # to a change in the library ends up here, and none of them should be
        # allowed to break the request that triggered the send.
        #
        # The address is logged and the body is NOT -- the body contains a
        # working one-time link, and log files are read by more people and kept
        # for far longer than anyone expects.
        print(f"EMAIL FAILED to {to}: {type(error).__name__}: {error}", flush=True)

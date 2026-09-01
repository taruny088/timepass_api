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
from dataclasses import dataclass

import resend

# Loaded once when this file is first imported.
#
# None means "no key configured", which is the console-printing mode described
# above. Empty string counts as None: an environment variable that exists but
# was left blank is a mistake, not a choice.
RESEND_API_KEY = os.getenv("RESEND_API_KEY") or None

# Can this app actually send email right now?
#
# ADDED AFTER A REAL PIECE OF CONFUSION, and worth keeping for that reason.
# Without a key the resend endpoint still cheerfully replied "a new
# confirmation link is on its way to you@example.com" -- while sending nothing
# at all. So the person waits at an inbox that will never receive anything, and
# concludes the feature is broken. It was not; the message was lying.
#
# The rule this file already states for itself is that the fallback must be
# LOUD. That rule has to hold at the top of the stack too, not just in the
# server log -- a truthful log under a false message on screen is no better
# than silence, because the person reading the screen is not reading the log.
EMAIL_ENABLED = RESEND_API_KEY is not None

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


@dataclass
class EmailResult:
    """What happened when we tried to send.

    ADDED AFTER A BUG WORTH REMEMBERING. send_email used to catch every
    failure, print it, and return nothing at all. The caller had no way to
    tell a delivered email from a rejected one, so the resend endpoint
    cheerfully reported success either way -- and a genuine failure was
    invisible to everybody except whoever happened to read the server log.

    A function that can fail must be able to SAY it failed. Swallowing an
    error and returning None is how a broken feature comes to look like a
    working one.

    Note what is NOT here: the provider's own error text is deliberately not
    carried back to the browser. It goes to the log instead. `reason` is a
    short label for our own use, not something to show a user.
    """

    sent: bool
    reason: str | None = None


def send_email(to: str, subject: str, body: str) -> EmailResult:
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
        # Nothing went wrong -- there is simply no key. The caller checks
        # EMAIL_ENABLED to decide what to tell the user about that.
        return EmailResult(sent=True)

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
        return EmailResult(sent=True)
    except Exception as error:
        # Broad on purpose. Anything from an expired key to a network timeout
        # to a change in the library ends up here, and none of them should be
        # allowed to break the request that triggered the send.
        #
        # The address is logged and the body is NOT -- the body contains a
        # working one-time link, and log files are read by more people and kept
        # for far longer than anyone expects.
        #
        # PRINTED AS A BLOCK, like the no-key fallback above, because this is
        # the line that actually explains a "my email never arrived" report and
        # it must not be lost among ordinary request logging.
        #
        # The provider's message is worth reading in full. The commonest one by
        # far names its own cause and the fix:
        #
        #   "You can only send testing emails to your own email address
        #    (you@example.com)"
        #
        # That is Resend's shared test sender, onboarding@resend.dev, refusing
        # to deliver anywhere except the address the Resend account is
        # registered to. It is not a fault in this code and no amount of
        # retrying changes it -- it needs a domain of your own, verified with
        # Resend, and EMAIL_FROM pointed at it.
        print("=" * 70)
        print("EMAIL FAILED -- the provider refused it. Nothing was delivered.")
        print("Intended recipient:", to)
        print("From:", EMAIL_FROM)
        print(f"{type(error).__name__}: {error}")
        print("=" * 70, flush=True)

        # Reported back, not swallowed. The caller decides what to tell the
        # user; the detail above stays in the log, because a provider's raw
        # error can name addresses and settings that belong to whoever runs
        # this server rather than to whoever is reading the screen.
        return EmailResult(sent=False, reason="provider_rejected")

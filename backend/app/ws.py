"""The live connection: /ws.

One address, one job -- let a logged-in person hold a connection open so the
server can push messages to them the moment they are saved.

HOW THIS IS DIFFERENT FROM EVERY OTHER ENDPOINT IN THE PROJECT.

An ordinary endpoint is a question and an answer: the browser asks, we reply,
the connection closes. This one accepts a connection and then STAYS, sometimes
for hours. There is no response body, no status code after the first moment,
and no Depends(get_current_user) doing the security for us.

THE FOUR STEPS, in order, and the order is the security:

    1. Check the connection came from our own website.
    2. Accept it -- but treat it as nobody.
    3. Wait for one frame carrying the login token, with a short deadline.
    4. Only if that token is good, add the socket to the registry.

Nothing is ever pushed to a socket that has not finished step 4. An entry in
the registry is permission to receive somebody's private messages, so it is
handed out exactly once, after a token has been checked, and never on the
strength of the address the browser connected to.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app import realtime
from app.config import ALLOWED_ORIGINS
from app.database import SessionLocal
from app.models import User
from app.security import decode_access_token

router = APIRouter(tags=["realtime"])

# WHY NOT PLAIN logging.info().
#
# Python's root logger ignores anything below WARNING unless somebody
# configures it, and nobody here does -- so logging.info() lines are written
# and then silently thrown away. main.py only gets away with it because it logs
# at ERROR, which is above the cut-off.
#
# "uvicorn.error" is the logger the server itself already set up and is already
# printing, despite the name: uvicorn uses it for ordinary startup and
# connection lines, not just errors. Attaching to it means these appear in the
# same stream as everything else, locally and in Render's log.
logger = logging.getLogger("uvicorn.error")

# How long the browser has to send its token after connecting. Generous enough
# for a slow phone, short enough that an anonymous socket cannot sit there.
AUTH_TIMEOUT_SECONDS = 10

# How long the server waits for ANY frame before deciding the connection is
# dead. The browser sends a ping every 25 seconds (see socket.js), so 70 is
# comfortably more than two missed pings -- one lost ping on a bad phone signal
# must not close a working chat.
#
# WHY THE SERVER NEEDS THIS AT ALL. A browser that closes properly sends a
# closing frame and we find out at once. A phone that drives into a tunnel
# sends nothing, and the connection sits there looking perfectly healthy,
# because "nobody is talking" and "dead" look identical from this end. Without
# a deadline those sockets accumulate for the life of the process.
IDLE_TIMEOUT_SECONDS = 70

# CLOSE CODES. Every WebSocket closure carries a number, the same way an HTTP
# response carries a status code -- and like status codes, some are standard
# and a range is left free for applications to define.
#
# 1008 is the standard "policy violation".
# 4000-4999 are reserved for the application, so 4401 is ours: it is not an
# HTTP status, it just borrows 401's meaning so it reads clearly in a log.
# The browser can read this number, which is what lets socket.js tell "the
# server refused me, stop retrying" apart from "the network dropped, retry".
CLOSE_POLICY_VIOLATION = 1008
CLOSE_UNAUTHENTICATED = 4401


def _authenticate(token: str) -> int | None:
    """Turn a token into a user id, or None. The WebSocket's get_current_user.

    Deliberately the same three steps as deps.get_current_user: is the token
    genuine and in date, and does the user it names still exist? A token proves
    only who issued it -- an account deleted an hour ago still has a perfectly
    valid token, and must still be refused.

    It cannot literally reuse get_current_user, because that is a FastAPI
    dependency that reads an Authorization header, and a WebSocket has no such
    header to read.
    """
    user_id = decode_access_token(token)
    if user_id is None:
        return None

    # A session opened by hand rather than through Depends(get_db).
    #
    # get_db is built for a request: it hands over a session and closes it when
    # the request ends. A WebSocket "request" ends hours later, so using it here
    # would hold one database connection open for the whole life of the
    # connection -- and a free PostgreSQL plan does not have many to spare.
    #
    # So: open one, ask one question, close it. try/finally, so it closes even
    # if the lookup throws.
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        return user.id if user is not None else None
    finally:
        db.close()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """One live connection, from handshake to close."""

    # --- 1. Where did this come from? ---------------------------------------
    #
    # THE CORS MIDDLEWARE IN main.py DOES NOT PROTECT THIS ENDPOINT. That is
    # not a mistake in how it is configured -- CORS simply does not apply to
    # WebSockets, and browsers do not enforce same-origin on them either. Any
    # page on the internet may open a WebSocket to this address and the browser
    # will not stop it.
    #
    # How much that matters here: not very much, because the token lives in
    # localStorage, and a page on another domain cannot read our localStorage.
    # An attacker's page can open the socket and then has nothing to say, so it
    # is closed ten seconds later having achieved nothing.
    #
    # It is still checked, because it costs three lines and it is the check
    # that would matter enormously if the login token ever moved into a cookie
    # -- cookies ARE sent automatically on a WebSocket handshake, and then this
    # line is the only thing standing between a stranger's page and a live feed
    # of your private messages.
    #
    # Origin is missing when the connection is not from a browser -- curl, a
    # test script, a mobile app. Those are not what this defends against (they
    # have no credentials of yours to send automatically), so a missing Origin
    # goes on to the token check, which refuses them anyway unless they can
    # produce a real token.
    origin = websocket.headers.get("origin")
    if origin is not None and origin.rstrip("/") not in ALLOWED_ORIGINS:
        # Closing BEFORE accepting refuses the handshake outright: the browser
        # sees the connection fail rather than open and immediately close.
        await websocket.close(
            code=CLOSE_POLICY_VIOLATION, reason="Origin not allowed."
        )
        return

    # --- 2. Accept, as nobody -----------------------------------------------
    #
    # accept() completes the handshake -- the "101 Switching Protocols" moment
    # where an ordinary HTTP request stops speaking HTTP and becomes a
    # WebSocket. Until this line frames cannot be sent or received at all,
    # which is exactly why the token cannot be checked before it.
    #
    # Accepting is NOT trusting. Between here and step 4 this connection
    # belongs to nobody, is in no registry, and can receive nothing.
    await websocket.accept()

    # --- 3. The token, as the first frame ------------------------------------
    #
    # WHY NOT ?token=... IN THE ADDRESS, which would have been far less code:
    # web servers, proxies and hosting platforms log full request paths as a
    # matter of routine, so the login token would be written in plain text into
    # Render's logs, where it would sit for anyone with access to them.
    #
    # A frame is not part of the address, so it is not logged anywhere. The
    # cost is this block -- and since the browser cannot send an Authorization
    # header on a WebSocket, some arrangement like this was always needed.
    #
    # asyncio.wait_for puts a deadline on an await: "do this, but give up after
    # N seconds". Without it a connection that says nothing sits here forever
    # holding memory, and that is trivial to do on purpose.
    try:
        first_frame = await asyncio.wait_for(
            websocket.receive_text(), timeout=AUTH_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        await websocket.close(code=CLOSE_UNAUTHENTICATED, reason="No token sent.")
        return
    except WebSocketDisconnect:
        # They hung up before saying anything. Not an error.
        return

    token = _read_token(first_frame)

    if token is None:
        await websocket.close(
            code=CLOSE_UNAUTHENTICATED, reason="Expected an auth frame."
        )
        return

    # run_in_threadpool, because _authenticate talks to the database and that is
    # ordinary blocking code. Running it directly here would stop the event
    # loop -- and the event loop is what every other open WebSocket in the app
    # is running on. This is the same trick FastAPI performs automatically for a
    # plain `def` endpoint; here it has to be asked for by name.
    user_id = await run_in_threadpool(_authenticate, token)

    if user_id is None:
        # Deliberately the same reply for expired, forged, malformed and
        # deleted-account, exactly as deps.get_current_user gives the same 401
        # for all of them.
        await websocket.close(code=CLOSE_UNAUTHENTICATED, reason="Invalid token.")
        return

    # --- 4. Registered, and only now able to receive -------------------------
    realtime.add(user_id, websocket)
    logger.info(
        "WebSocket open for user %s (%s open in total)",
        user_id,
        realtime.connection_count(),
    )

    try:
        # Tells the browser the connection is genuinely usable, not merely
        # open. socket.js waits for this before calling itself connected, and
        # uses it as the moment to fetch anything missed while it was away.
        await websocket.send_json({"type": "ready", "user_id": user_id})

        await _listen(websocket)
    except WebSocketDisconnect:
        # The ordinary ending: tab closed, phone locked, laptop lid shut.
        pass
    except Exception:
        # Anything else gets logged and then treated the same way. A crash in
        # here must not leave the socket in the registry.
        logger.exception("WebSocket error for user %s", user_id)
    finally:
        # THE MOST IMPORTANT LINE IN THIS FILE.
        #
        # `finally` runs however this block ends -- normal close, dropped
        # connection, unexpected error. A socket left in the registry after it
        # is dead is a leak that grows for the life of the process, and every
        # later push wastes time writing into it.
        realtime.remove(user_id, websocket)
        logger.info(
            "WebSocket closed for user %s (%s left)",
            user_id,
            realtime.connection_count(),
        )


async def _listen(websocket: WebSocket) -> None:
    """Read frames until the connection ends.

    THE BROWSER BARELY SENDS ANYTHING, and that is the design. Messages are
    sent with an ordinary POST, which already exists, already returns the saved
    row, and already gives the frontend a real error to retry from. A frame
    pushed into a half-dead socket gives none of that. So this connection is
    for DELIVERY only, and the only thing arriving on it is a heartbeat.

    WHY A HEARTBEAT WE WRITE OURSELVES. The WebSocket protocol has its own ping
    and pong frames built in -- but the browser's WebSocket API gives
    JavaScript no way to send one. So an app-level ping it is: a tiny JSON
    frame that means the same thing.

    It does two jobs. It proves to each side that the other is still there, and
    it keeps the connection from being closed for being idle -- proxies and
    load balancers commonly drop a connection that has been silent for a minute
    or two, which on a quiet chat would otherwise happen constantly.
    """
    while True:
        # The same idea as the auth deadline, for the same reason: silence and
        # death look identical from this end, so silence gets a time limit.
        try:
            raw = await asyncio.wait_for(
                websocket.receive_text(), timeout=IDLE_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            # Two heartbeats missed. Assume it is gone and let the caller's
            # `finally` clean it up. The browser notices and reconnects.
            await websocket.close(
                code=CLOSE_POLICY_VIOLATION, reason="No heartbeat."
            )
            return

        if _read_type(raw) == "ping":
            await websocket.send_json({"type": "pong"})
            continue

        # Anything else is ignored on purpose rather than answered with an
        # error. Nothing in the app sends anything else, so a frame arriving
        # here is either a bug of ours or somebody poking at the endpoint --
        # and replying with a description of what was wrong would only help the
        # second one.
        logger.debug("Ignoring an unexpected frame on the socket.")


def _read_token(raw: str) -> str | None:
    """Pull the token out of an auth frame, or None if it is not one.

    Expects exactly:  {"type": "auth", "token": "eyJhbGciOi..."}

    EVERY BAD SHAPE ANSWERS None -- not valid JSON, not an object, wrong type,
    missing token, a token that is not text. This is the first thing an unknown
    stranger sends us, so it is read defensively: nothing in here may throw,
    because a crash while reading a hostile frame is itself the problem.
    """
    frame = _parse(raw)

    if frame is None or frame.get("type") != "auth":
        return None

    token = frame.get("token")

    if not isinstance(token, str) or not token:
        return None

    return token


def _read_type(raw: str) -> str | None:
    """The "type" field of a frame, or None if there is not a readable one."""
    frame = _parse(raw)

    if frame is None:
        return None

    event_type = frame.get("type")

    return event_type if isinstance(event_type, str) else None


def _parse(raw: str) -> dict | None:
    """JSON text to a dictionary, or None for anything that is not one.

    json.loads happily returns a number, a string or a list for perfectly valid
    JSON like `7` or `"hello"`. Calling .get() on those raises. The isinstance
    check is what turns "unexpected input" into None instead of a crash.
    """
    try:
        frame = json.loads(raw)
    except (ValueError, TypeError):
        return None

    return frame if isinstance(frame, dict) else None

"""Who is connected right now, and how to push something to them.

This file is the LIST. ws.py is the door people come in through. They are
separate for the same reason conversations.py and messages.py are separate:
one job each.

WHAT A PUSH IS, in one paragraph. Every request so far has been the browser
asking and the server answering. A WebSocket is a connection that stays open
in both directions, so the server can speak first. To do that it has to
remember which open connections belong to which person -- that memory is the
dictionary below, and remembering it is the whole job of this file.

THE ONE LIMITATION, WRITTEN DOWN BECAUSE IT IS INVISIBLE LATER.

_connections lives in this process's memory. It is not in the database and it
is not shared with anything.

That is fine today: Render's free plan runs ONE copy of the backend. If this
ever runs two copies, the connections split between them -- Alice's socket on
copy A, Bob's on copy B -- and copy A pushing to Bob finds nothing in its own
dictionary and pushes to nobody. The message saves perfectly, no error appears
anywhere, and it simply never arrives.

The real fix for that is Redis pub/sub: the copies shout to each other, so a
push on copy A reaches Bob on copy B. That is a new service, a new library and
a whole new idea, for a problem this app does not have. If the day comes that
the backend is scaled past one instance, THIS FILE is what has to change.
"""

import asyncio
import logging

from fastapi import WebSocket

# user id -> the sockets that person currently has open.
#
# A SET, NOT A SINGLE SOCKET. One person can have the app open on a phone and
# on a laptop, and both must receive the message. Storing one socket per user
# would silently mean "only the most recent device gets messages", which is the
# kind of bug that looks like a flaky network.
_connections: dict[int, set[WebSocket]] = {}

# The event loop the server is running on. Captured the first time anybody
# connects -- see publish() for why this is needed at all.
_loop: asyncio.AbstractEventLoop | None = None


def add(user_id: int, websocket: WebSocket) -> None:
    """Remember that this person has this connection open.

    Called from ws.py, on the event loop, once the token has been checked.
    Never call it before authenticating -- an entry here is a permission to
    receive somebody's private messages.
    """
    global _loop

    # Captured here rather than at startup, and that is not laziness.
    #
    # asyncio.get_running_loop() only works from inside async code. This
    # function is only ever called from the WebSocket endpoint, which is async,
    # so the loop is available and correct. And if nobody has ever connected,
    # _loop stays None -- which is exactly right, because with no connections
    # there is nothing to push to anyway.
    if _loop is None:
        _loop = asyncio.get_running_loop()

    # setdefault: "give me the set for this user, making an empty one if there
    # is none". Without it, the first connection for each person needs its own
    # if-statement.
    _connections.setdefault(user_id, set()).add(websocket)


def remove(user_id: int, websocket: WebSocket) -> None:
    """Forget a connection that has closed.

    MUST run even when the connection died badly, which is why ws.py calls it
    from a `finally`. A socket left in here after it is dead is a slow leak:
    the dictionary grows for the life of the process, and every push wastes
    time writing to something nobody is holding.

    Written to be safe to call twice. A connection can end in more than one
    way, and a cleanup that throws when there is nothing to clean up turns a
    normal disconnect into an error in the log.
    """
    sockets = _connections.get(user_id)
    if not sockets:
        return

    sockets.discard(websocket)  # discard, not remove: no error if it is gone.

    # Drop the empty set, so the dictionary holds only people actually online.
    if not sockets:
        _connections.pop(user_id, None)


def publish(user_id: int, payload: dict) -> None:
    """Send one event to every connection this person has open.

    THIS FUNCTION IS ORDINARY, NOT ASYNC, AND THAT IS THE POINT.

    Sending over a socket is async work. But the endpoints that need to push --
    send_message and mark_read in messages.py -- are ordinary `def` functions,
    and inside one of those you cannot `await` anything.

    Making those endpoints `async def` instead would look like the easy fix and
    would be a bad trade. Our database calls are the ordinary blocking kind.
    FastAPI runs a plain `def` endpoint on a separate worker thread precisely so
    that waiting on the database does not stop everything else; turn them async
    and every query would block the single event loop -- including every open
    WebSocket in the app.

    So instead: this function is callable from anywhere, and it HANDS the actual
    sending to the event loop.

    asyncio.run_coroutine_threadsafe is the bridge. It takes a piece of async
    work and safely queues it onto a loop running in another thread. It returns
    immediately -- we never wait for the result, because whether a push lands is
    not something a POST should succeed or fail on. The message is already
    saved. Delivery is a bonus on top.
    """
    # Nobody with this id is connected, so there is nothing to do. This is the
    # normal case, not an edge case: most people are not online most of the
    # time.
    if not _connections.get(user_id):
        return

    loop = _loop
    if loop is None:
        return

    asyncio.run_coroutine_threadsafe(_send_to_user(user_id, payload), loop)


async def _send_to_user(user_id: int, payload: dict) -> None:
    """The real sending. Runs on the event loop, never called directly.

    NOTHING IN HERE MAY RAISE. It runs detached from any request, so an
    exception has nowhere to go and would surface as an unexplained warning
    from deep inside asyncio.
    """
    # A COPY of the set, taken before sending anything.
    #
    # Sending awaits, and while awaiting, another connection for the same
    # person can open or close -- which changes the set. Iterating a set that
    # changes underneath you is an error in Python. Copying it first costs
    # nothing and removes the whole class of problem.
    sockets = list(_connections.get(user_id, ()))

    for websocket in sockets:
        try:
            await websocket.send_json(payload)
        except Exception:
            # A DEAD SOCKET IS NORMAL, NOT AN ERROR.
            #
            # Someone closed a tab, a phone lost signal, the wifi changed. We
            # find out by trying to write to it and failing. There is nothing
            # to report and nobody to report it to -- just tidy up.
            #
            # logging.debug rather than warning: at warning level a busy day of
            # people closing tabs would fill the log with things nobody needs
            # to act on.
            logging.debug("Dropping a dead socket for user %s", user_id)
            remove(user_id, websocket)


def connection_count() -> int:
    """How many sockets are open in total. For /health and for debugging.

    Useful in a way that is hard to appreciate until something goes wrong: if
    this number only ever grows and never falls, connections are not being
    cleaned up, and that is a leak worth finding early.
    """
    return sum(len(sockets) for sockets in _connections.values())

"""Settings that more than one file needs.

Only one thing lives here so far: the list of websites allowed to talk to this
backend.

WHY IT MOVED OUT OF main.py IN PHASE 16c. It used to be worked out in main.py,
which was the right place while main.py was the only file that needed it. ws.py
now needs the same list -- and it cannot import main.py, because main.py
imports ws.py, and two files that import each other is a circular import that
fails at startup.

Copying the three lines of parsing into ws.py would have worked today and drifted
tomorrow: somebody fixes the trailing-slash handling in one copy and not the
other, and the WebSocket then rejects an origin the API accepts. One list, one
place.
"""

import os

# Where the website is allowed to call us from.
#
# app.database has already run load_dotenv by the time anything imports this,
# so the value from backend/.env is available. On a hosting platform there is
# no .env file at all -- load_dotenv does nothing and os.getenv reads the real
# environment variables the platform provides instead.
#
# The value may list SEVERAL addresses separated by commas, so the same
# deployment can allow the live site and a developer's laptop at once:
#
#     FRONTEND_ORIGIN=http://localhost:5173,https://insta-clone.onrender.com
#
# With no comma it is simply a list of one, which is why local development is
# unaffected.
_frontend_origins_raw = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

# .strip() removes stray spaces around a comma, so "a, b" works as well as
# "a,b".
#
# .rstrip("/") removes a trailing slash, and that matters more than it looks.
# The CORS check compares plain text, so "https://site.com" and
# "https://site.com/" are two different things to it. A stray slash is one of
# the most common deployment mistakes, and it fails silently from the server's
# side -- the browser reports the error, the backend logs nothing unusual.
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in _frontend_origins_raw.split(",")
    if origin.strip()
]

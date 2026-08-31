# Timepass

A working Instagram-style app, built from scratch: PostgreSQL, a FastAPI
backend, and a React website. Everything a click does reaches the database and
comes back.

This was built as a learning project, one phase at a time, with each phase
finished and working before the next was started. The plan it follows is in
[PLAN.md](PLAN.md).

---

## What it does

| Feature | Description |
|---|---|
| Sign up | Create an account with a username, email and password |
| Log in | Log in and stay logged in across a page refresh |
| Profile page | Photo grid, bio, post / follower / following counts |
| Create a post | Add a photo by pasting an image link, with a caption |
| Delete a post | Delete your own posts, and only your own |
| Follow / unfollow | Follow other people and stop following them |
| Home feed | Posts from the people you follow, newest first, 20 at a time |
| Like / unlike | A heart that responds instantly |
| Comment | Write, read and delete comments |
| Search | Find people by username or name |

---

## Built with

**Backend** — Python, FastAPI, SQLAlchemy, Pydantic, PostgreSQL, bcrypt, PyJWT

**Frontend** — React 19, Vite, React Router, Tailwind CSS 4, Axios

---

## Before you start

| Software | Minimum version | Check with |
|---|---|---|
| Python | 3.11 | `python --version` |
| Node.js | 18 | `node --version` |
| PostgreSQL | 14 | `psql --version` |
| Git | any recent | `git --version` |

PostgreSQL must not only be installed, it must be **running**:

```bash
psql -U postgres -c "SELECT version();"
```

If that prints text, the database is up. If it gives a connection error,
PostgreSQL is installed but switched off, and must be started first.

---

## Setup

### 1. Get the code

```bash
git clone https://github.com/taruny088/instagram-clone.git
cd instagram-clone
```

### 2. Create the database

```bash
psql -U postgres -c "CREATE DATABASE insta_clone;"
```

### 3. Set up the backend

```bash
cd backend
python -m venv venv
```

Activate the virtual environment:

```powershell
# Windows PowerShell
.\venv\Scripts\activate
```
```bash
# macOS / Linux
source venv/bin/activate
```

Then install the packages:

```bash
pip install -r requirements.txt
```

### 4. Create the settings file

Copy the example and fill in real values:

```powershell
copy .env.example .env      # Windows
```
```bash
cp .env.example .env        # macOS / Linux
```

Open `backend/.env` and set:

- **`DATABASE_URL`** — replace `your_password_here` with your PostgreSQL password
- **`JWT_SECRET_KEY`** — generate a real random one, do not invent it by typing:

  ```bash
  python -c "import secrets; print(secrets.token_hex(32))"
  ```

`.env` is ignored by Git and must never be committed. `.env.example` is
committed, and shows the shape of the file without the secrets.

### 5. Create the tables

```bash
python create_tables.py
```

This reads the models and creates the five tables. It is safe to run more
than once — it only creates tables that are missing.

### 6. Set up the frontend

```bash
cd ../frontend
npm install
```

---

## Running it

### The easy way (Windows)

From the project root:

```powershell
.\start.ps1
```

It checks the virtual environment, the settings file, the database connection
and the installed packages, then opens the backend and frontend in their own
windows.

### Manually — two terminals, both open

**Terminal 1, backend:**
```powershell
cd backend
.\venv\Scripts\activate
uvicorn app.main:app --reload
```

**Terminal 2, frontend:**
```bash
cd frontend
npm run dev
```

Then open **<http://localhost:5173>**

> Use `localhost`, not `127.0.0.1`. Vite listens on IPv6 only, so
> `127.0.0.1:5173` will refuse the connection.

The API's own test page is at **<http://localhost:8000/docs>** — every
endpoint, with a button to try it.

---

## The API

Every endpoint except signup and login needs an `Authorization: Bearer <token>`
header.

### Auth
| Method | Path | Does |
|---|---|---|
| `POST` | `/auth/signup` | Create an account |
| `POST` | `/auth/login` | Get a token |
| `GET` | `/auth/me` | Who am I |

### Posts
| Method | Path | Does |
|---|---|---|
| `POST` | `/posts` | Create a post |
| `GET` | `/posts/{id}` | One post |
| `DELETE` | `/posts/{id}` | Delete your own post |

### Users
| Method | Path | Does |
|---|---|---|
| `GET` | `/users/{username}` | Profile and counts |
| `GET` | `/users/{username}/posts` | Their photo grid |
| `POST` | `/users/{username}/follow` | Follow |
| `DELETE` | `/users/{username}/follow` | Unfollow |

### Feed, likes, comments, search
| Method | Path | Does |
|---|---|---|
| `GET` | `/feed?limit=20&offset=0` | Posts from people you follow |
| `POST` | `/posts/{id}/like` | Like |
| `DELETE` | `/posts/{id}/like` | Unlike |
| `POST` | `/posts/{id}/comments` | Write a comment |
| `GET` | `/posts/{id}/comments` | Read comments |
| `DELETE` | `/comments/{id}` | Delete a comment |
| `GET` | `/search/users?q=` | Find people |

---

## How the database is shaped

Five tables.

```
users ──────< posts ──────< comments
  │             │              │
  │             └──< likes >───┘
  │                    │
  └────────────────────┘
  │
  └──< follows >── users   (same table, both sides)
```

| Table | Key | Notes |
|---|---|---|
| `users` | `id` | username and email are unique; only a password **hash** is stored |
| `posts` | `id` | belongs to one user; indexed on `(user_id, created_at DESC)` |
| `comments` | `id` | belongs to a post **and** a user; flat, no replies to replies |
| `likes` | `(user_id, post_id)` | no `id` column — the pair is the key, so a double like is impossible |
| `follows` | `(follower_id, following_id)` | both columns point back at `users`; a check constraint blocks self-follows |

**Counts are never stored.** Likes, comments, posts and followers are all
counted when asked. A stored count drifts out of step with reality, and then
the app shows a lie that is very hard to trace.

**Deletes cascade.** Removing a user removes their posts, follows, likes and
comments — enforced by PostgreSQL, not by application code.

---

## Project layout

```
backend/
  app/
    main.py        assembles the app, CORS
    database.py    the connection, and Base
    models.py      the five tables
    schemas.py     what may be sent in and seen out
    security.py    password hashing and tokens
    deps.py        get_current_user - "who is asking?"
    auth.py        signup, login, me
    posts.py       create, view, delete a post
    users.py       profiles, follow, unfollow
    feed.py        the one query that joins follows to posts
    likes.py       like, unlike
    comments.py    comment endpoints
    search.py      find people
    post_view.py   builds post replies with their counts
  create_tables.py

frontend/src/
  api/client.js       one Axios instance; attaches the token to every request
  auth/AuthContext    who is logged in
  components/         Header, PostCard, LikeButton, FollowButton,
                      CommentList, PostImage, ProtectedRoute, ErrorBoundary
  pages/              Login, Signup, Home, Profile, CreatePost,
                      PostDetail, Search, NotFound
```

---

## Deploying to Render

Three pieces are deployed separately: a managed PostgreSQL database, the
backend as a Web Service, and the frontend as a Static Site.

**No application code changes are needed.** Every address is an environment
variable with a local default.

### 1. PostgreSQL

Create a Render PostgreSQL instance. Note the region and use the **same one**
for the backend — a database in one region and a backend in another means
every query crosses the network for no reason.

Render gives an **Internal** URL (usable only from inside Render, and what the
backend should use) and an **External** URL (usable from anywhere, needed in
step 2).

**You must change the prefix.** Render hands you `postgresql://...`; this
project needs the driver named explicitly:

```
postgresql+psycopg://user:password@host/dbname
```

Without `+psycopg`, SQLAlchemy looks for `psycopg2`, which is not in
`requirements.txt`, and the app will not start.

### 2. Create the tables

The new database is completely empty. Run the existing script once, pointed at
the remote database. There is no need to edit `backend/.env` — set the value
for a single command:

```powershell
# Windows PowerShell, from the backend folder, venv active
$env:DATABASE_URL="postgresql+psycopg://user:pass@host/dbname"; python create_tables.py; Remove-Item Env:DATABASE_URL
```
```bash
# macOS / Linux
DATABASE_URL="postgresql+psycopg://user:pass@host/dbname" python create_tables.py
```

Use the **External** URL here, since this runs from your own machine. An
environment variable set this way takes precedence over `.env`, because
`load_dotenv` does not overwrite variables that are already set.

Skip this step and the backend starts fine but every request fails with
`relation "users" does not exist`.

### 3. Backend — Web Service

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

- `--host 0.0.0.0` accepts connections from outside the machine. The default
  accepts only local ones, which on a server means nobody can reach it.
- `$PORT` is chosen by Render, not by you.
- No `--reload`. That watches files for changes; it is a development feature.

Environment variables:

| Key | Value |
|---|---|
| `DATABASE_URL` | the **Internal** URL, prefix corrected |
| `JWT_SECRET_KEY` | **a newly generated one**, not the development key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` |
| `FRONTEND_ORIGIN` | set in step 5 |
| `PYTHON_VERSION` | `3.12` |

Check it with `https://<your-api>.onrender.com/health`, which should report
`{"status": "ok", "database": "connected"}` — proving the server is up *and*
can reach PostgreSQL.

### 4. Frontend — Static Site

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |

Environment variables:

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://<your-api>.onrender.com` (no trailing slash) |
| `NODE_VERSION` | `20` |

`VITE_API_URL` is required for a production build. Without it the build still
succeeds, but the deployed page stops immediately with a named error in the
browser console:

```
VITE_API_URL is not set. A production build needs it to know where the
backend is. Set it before running "npm run build".
```

That is deliberate. The alternative — falling back to `localhost` — produces a
site that loads perfectly and where nothing works, because `localhost` in a
deployed site means the *visitor's* own computer. A blank page naming its own
cause is far easier to diagnose than a working page whose every request fails.

**Add a rewrite rule**, or every page except the home page will 404 on
refresh:

| Source | Destination | Action |
|---|---|---|
| `/*` | `/index.html` | **Rewrite** |

The whole app is one HTML file and React Router does the routing in the
browser. Without this rule, a request for `/profile/john_23` makes the server
look for a file of that name and return 404. It must be Rewrite, not Redirect.

### 5. Point CORS at the deployed site

Back on the backend service, set:

```
FRONTEND_ORIGIN=https://<your-site>.onrender.com
```

Several addresses may be listed, separated by commas, to allow local
development at the same time:

```
FRONTEND_ORIGIN=http://localhost:5173,https://<your-site>.onrender.com
```

This step is last because the frontend's address is not known until step 4.

### Deployment troubleshooting

| Symptom | Cause |
|---|---|
| `ModuleNotFoundError: psycopg2` | `DATABASE_URL` prefix is not `postgresql+psycopg://` |
| `relation "users" does not exist` | Step 2 was skipped |
| Blocked by CORS policy | `FRONTEND_ORIGIN` does not match exactly — check `https` |
| 404 on refresh, home page fine | The rewrite rule is missing |
| Requests still go to localhost | `VITE_API_URL` was not set before the build; rebuild |
| Service deploys but will not start | `--host 0.0.0.0` missing from the start command |
| First request takes ~40 seconds | Free instances sleep when idle |

### After the first deploy

`create_tables.py` only ever creates **missing** tables. It never alters an
existing one, so once there is real data a schema change needs a migration
tool such as Alembic. Adding a column and re-running the script does nothing,
silently.

## Troubleshooting

**`[WinError 10013] An attempt was made to access a socket in a way forbidden
by its access permissions`**

On Windows this almost always means the port is **already in use**, not that
you lack permission. Find what is holding it:

```powershell
netstat -ano | findstr :8000
taskkill /PID <the number> /F
```

Note that `uvicorn` starts a child process. If the port stays busy after
killing the parent, look for a `python.exe` whose `ParentProcessId` is the
PID you just killed:

```powershell
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Select ProcessId, ParentProcessId
```

**`blocked by CORS policy: No 'Access-Control-Allow-Origin' header`**

The backend is not permitting the website's address. Check
`FRONTEND_ORIGIN` in `backend/.env` matches where the site is actually
running, and restart the backend. The fix is always on the backend.

**The website loads but every button fails**

The backend is not running. It is a separate program in a separate terminal.

**`127.0.0.1:5173` refuses to connect**

Use `localhost:5173`. Vite binds to IPv6 only.

**`DATABASE_URL is missing`**

You have not created `backend/.env` — copy `.env.example` and fill it in.

**You added a column and the database did not change**

`create_tables.py` only creates **missing** tables; it never alters an
existing one. While a table is empty, drop it and run the script again:

```bash
psql -U postgres -d insta_clone -c "DROP TABLE posts;"
python create_tables.py
```

Once there is data worth keeping, the proper tool is a migration library such
as Alembic.

---

## What this deliberately does not do

Being clear about the edges matters more than pretending there are none.

- **There is no real logout.** A JWT cannot be cancelled by the server, so
  logging out only makes the browser forget its copy. A token already copied
  keeps working until it expires. The 15-minute expiry limits the damage.
- **The token is kept in `localStorage`**, which page JavaScript can read. An
  httpOnly cookie would be safer but needs server-set cookies and CSRF
  protection.
- **Feed paging uses offset**, so a post created while you are reading page 1
  shifts everything down and page 2 can repeat one. Cursor paging is the fix
  at scale.
- **Search cannot use an index.** A `LIKE '%term%'` pattern makes PostgreSQL
  read every row. Fine for a few dozen users; `pg_trgm` or full-text search is
  the answer for more.
- **Images are links, not uploads.** Nothing is stored on the server, and a
  link that rots shows "Image unavailable".
- **No password reset, email verification, private accounts, blocking,
  notifications, stories, video or messaging.**

---

## Security notes

- Passwords are stored as **bcrypt hashes**, never as text, and never leave
  the server. `UserOut` does not list `password_hash`, so it cannot be sent
  to a browser even by mistake.
- **Other people's email addresses are never exposed.** Profiles and post
  authors use a slimmer schema that has no email field.
- **Ownership is checked on the server.** Hidden buttons stop nobody — a
  request to delete someone else's post returns `403` regardless of what the
  interface offered.
- Login failures give **one message** for both a wrong email and a wrong
  password, and take the same time either way, so nobody can discover which
  addresses have accounts.
- Every query goes through SQLAlchemy as **parameters**, so user input cannot
  become SQL.
- Secrets live in `.env`, which is never committed.

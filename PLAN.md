# Basic Instagram — Project Document

---

## 1. My goal

I want to build a **basic Instagram-style app that works from start to finish**.

That means:

- A real database that stores users, posts, likes, comments and follows.
- A real backend that reads and writes that data.
- A real website that people can open, sign up on, and use.

All three parts must be connected and working together. When someone clicks a button on the screen, that click must reach the database and come back with real data.

I am building only the **basic features**. I am not building the advanced parts of Instagram (video, stories, messages, recommendations). Those are extra features, not core ones. The core is what I want to understand deeply.

---

## 2. What I am building

| # | Feature | What the user can do |
|---|---|---|
| 1 | Sign up | Create an account with a username, email and password |
| 2 | Log in | Log in and stay logged in |
| 3 | Profile page | See a user's photo grid, bio and follower counts |
| 4 | Create a post | Add a photo by pasting an image link, with a caption |
| 5 | Delete a post | Delete only their own posts |
| 6 | Follow / unfollow | Follow other users and stop following them |
| 7 | Home feed | See posts from the people they follow, newest first |
| 8 | Like / unlike | Tap a heart on a post |
| 9 | Comment | Write comments under a post |

That is the whole app. Nine features.

---

## 3. How the app works

The app has four parts. Each part has one job. Data flows down and comes back up.

```
1. WEBSITE (what the user sees)
        |
        |  asks for data
        v
2. BACKEND (the rules and decisions)
        |
        |  asks for data
        v
3. TRANSLATOR (turns Python into database language)
        |
        v
4. DATABASE (where everything is stored)
```

**The website** shows buttons, forms and photos. It does not store anything. Every time it needs data, it asks the backend.

**The backend** is the brain. It decides who is allowed to do what. For example: "Is this person logged in? Is this their post? Are they allowed to delete it?" It is the only part that is allowed to touch the database.

**The translator** converts between Python code and database language, so I do not have to write database commands by hand.

**The database** is the memory. It stores facts and never forgets them.

### One important rule

**Never trust the website.** Anyone can open their browser tools and send a fake request to my backend. So hiding a delete button on the screen is only for looks. The backend must *also* check that the person owns the post. That backend check is the one that really protects the data.

### What Instagram really is

Take away the design and Instagram is just four things:

1. A list of people
2. A list of posts
3. A list of who follows whom
4. One question that joins list 3 to list 2

That question is: **"Show me the newest posts written by the people I follow."**

That single question is the home feed. The home feed is the product. Everything else in the app supports it.

---

## 4. Technology I am using and why

### The database

**PostgreSQL**

This is the program that stores my data in tables, like very strict spreadsheets.

*Why:* My data is full of connections. A post belongs to a user. A comment belongs to a post and to a user. A follow connects two users. PostgreSQL understands these connections and can protect them itself. For example, I can tell it "a username must be unique" and it will refuse to save a second one. That means bad data is stopped at the storage level, not somewhere deep in my code.

### The backend

**Python** — the programming language for the backend.

*Why:* I already know it, and it is easy to read.

**FastAPI** — the tool that turns my Python functions into a web service.

*Why:* It needs very little setup code, so I can focus on learning the ideas instead of the tool. It also automatically creates a testing page in my browser. That means I can test my entire backend before writing a single line of website code. That is a big deal for learning — I get to check one half works before adding the other half.

**SQLAlchemy** — the translator between Python and PostgreSQL.

*Why:* Without it, I would write database commands as text strings inside my Python code, which is easy to get wrong. With it, I work with normal Python objects. A tool like this is called an **ORM** (Object Relational Mapper). Every language has one, so learning this idea transfers to any future job.

**Pydantic** — checks that incoming data has the right shape.

*Why:* If someone sends a signup request with no email, I want it rejected immediately with a clear message. Pydantic does that automatically, so bad data never reaches my real code.

**JWT and bcrypt** — the two pieces of the login system.

*Why:* **bcrypt** scrambles passwords before saving them, in a way that cannot be reversed. Even I cannot see a user's real password. **JWT** creates a small signed ticket that proves who the user is on every later request. Together they are the standard way logins work on the internet today.

### The website

**React** — the tool for building the screens.

*Why:* Instagram's feed is the same post card repeated many times with different data. React is built exactly for that: make one card design, feed it different data. It is also the most widely used tool of its kind, so help is easy to find.

**Vite** — starts and builds the React project.

*Why:* It starts instantly and updates the browser the moment I save a file. No configuration needed.

**React Router** — handles moving between pages.

*Why:* Without it, my app would be one single screen. With it, `/profile/john` and `/post/12` become real addresses that I can share and that work with the browser back button.

**Tailwind CSS** — for styling.

*Why:* I write the styling directly next to the thing I am styling. For a project this size, that is faster than building and maintaining a separate styling system.

**Axios** — sends requests from the website to the backend.

*Why:* It lets me write one small piece of setup that automatically attaches the user's login ticket to every request. Otherwise I would have to remember to attach it in twenty different places, and I would forget one.

### Other tools

**Git** — saves a snapshot of my project at each stage, so I can go back if something breaks.

**VS Code** — the editor I write code in.

---

## 5. What I need on my computer

Install these before starting. Everything else gets installed by the project itself.

| Software | Minimum version | What it is for |
|---|---|---|
| Python | 3.11 | Runs the backend |
| Node.js | 18 | Runs the website tools |
| PostgreSQL | 14 | Stores the data |
| Git | any recent | Saves project history |
| VS Code | any recent | Writing the code |

### How to check they are installed

Open a terminal and run these one by one:

```bash
python --version
node --version
psql --version
git --version
```

Each should print a version number. If any says "command not found", that one is missing and needs to be installed.

### One extra check

PostgreSQL must not only be installed, it must be **running**. Check with:

```bash
psql -U postgres -c "SELECT version();"
```

If this prints text, the database is running and ready. If it gives a connection error, the database is installed but switched off, and it must be started before Phase 1.

---

## 6. Database design

### Words I need first

- **Table** — like one sheet in a spreadsheet. One table holds one type of thing. All users live in the users table.
- **Row** — one line in that sheet. One row = one user.
- **Column** — one field, like "email" or "created_at".
- **Primary key** — the column that uniquely identifies a row. Usually a number that counts up: 1, 2, 3. No two rows can share it.
- **Foreign key** — a column that points at a row in another table. A post's `user_id` points at the user who wrote it. This is how tables get connected.
- **Index** — like the index at the back of a book. Without it the database checks every row one by one to find something. With it, the database jumps straight there. I add indexes where I know I will search often.

### I need five tables

Users, posts, comments, likes, follows. Nothing more. Every feature in section 2 is covered by these five.

---

### Table 1: `users`

Stores each person who signs up.

| Column | What it holds | Notes |
|---|---|---|
| id | 1, 2, 3… | Primary key |
| username | Their handle, e.g. `john_23` | Must be unique |
| email | Their email | Must be unique |
| password_hash | The scrambled password | Never the real password |
| full_name | Their display name | Can be empty |
| bio | Short description | Can be empty |
| avatar_url | Link to their profile photo | Can be empty |
| created_at | When they signed up | Filled in automatically |

**Why the password is stored scrambled:** if my database is ever stolen, the thief gets scrambled text that cannot be turned back into passwords. When someone logs in, I scramble what they typed and compare the two scrambled versions. The real password is never stored anywhere.

---

### Table 2: `posts`

Stores each photo post.

| Column | What it holds | Notes |
|---|---|---|
| id | 1, 2, 3… | Primary key |
| user_id | Which user wrote it | Foreign key to `users` |
| image_url | Link to the photo | Required |
| caption | The text under the photo | Can be empty |
| created_at | When it was posted | Filled in automatically |

**Index on:** `user_id` together with `created_at`, newest first.

*Why that index:* my two most common questions are "show me this user's posts, newest first" and "show me these users' posts, newest first". Both need exactly this order, so I tell the database to keep it ready in advance.

**One user, many posts.** One user can write many posts. Each post has exactly one author. This shape is called a **one-to-many relationship**, and it is the most common shape in any database.

---

### Table 3: `comments`

Stores each comment written under a post.

| Column | What it holds | Notes |
|---|---|---|
| id | 1, 2, 3… | Primary key |
| post_id | Which post it is under | Foreign key to `posts` |
| user_id | Who wrote it | Foreign key to `users` |
| body | The comment text | Required |
| created_at | When it was written | Filled in automatically |

**Index on:** `post_id` together with `created_at`.

This table has **two** foreign keys, because a comment belongs to a post *and* to a person. Comments are flat — no replies to replies. That keeps it simple.

---

### Table 4: `likes`

Stores which person liked which post.

| Column | What it holds |
|---|---|
| user_id | Who liked it |
| post_id | Which post they liked |
| created_at | When |

**This table has no `id` column.** The primary key is the pair `(user_id, post_id)` together. That is called a **composite primary key** — a key made of two columns instead of one.

*Why do it this way:* the database now physically refuses to store the same person liking the same post twice. If my code accidentally sends the like twice, the database blocks the second one. I do not need to write any "have they already liked this?" check in my code. The rule is enforced in the one place that cannot be bypassed.

**Index on:** `post_id`, because I often count how many likes one post has.

---

### Table 5: `follows`

Stores who follows whom.

| Column | What it holds |
|---|---|
| follower_id | The person doing the following |
| following_id | The person being followed |
| created_at | When |

**Primary key:** the pair `(follower_id, following_id)`, for the same reason as likes — you cannot follow the same person twice.

**Extra rule:** a check that `follower_id` and `following_id` are not the same, so nobody can follow themselves.

**Index on:** `following_id`, because I need to answer "who follows this user?" for the follower count.

**This table is unusual.** Both of its columns point back to the *same* table, `users`. One column means "this user" and the other means "that user". A table like this — connecting a table to itself — is the trickiest idea in the schema. But it is exactly how every social network stores its connections.

---

### How the tables connect

```
users ──────< posts ──────< comments
  │             │              │
  │             │              │
  │             └──< likes >───┘
  │                    │
  └────────────────────┘
  │
  └──< follows >── users   (same table, both sides)
```

In plain words:

- One user writes many posts.
- One post has many comments. One user writes many comments.
- Many users can like many posts. The `likes` table sits in the middle connecting them. A middle table like this is called a **join table**.
- Many users can follow many users. The `follows` table sits in the middle. Both sides are the same table.

### What I am deliberately not storing

I am **not** storing a `like_count` number on each post. Instead I count the likes when I need them.

*Why:* if I store the number separately, it can drift out of step with reality. Someone deletes a like but the number does not go down, and now my app shows a lie that is very hard to trace. Counting when needed is always correct. For a project of this size, counting is fast enough. If it ever became slow, storing the number would be the fix — but I should not fix a problem I do not have.

---

## 7. The phases

I build in nine steps. Each step must fully work before I move to the next.

### Why this order

The order is not a preference. It is forced by what depends on what:

- A post needs an author, so **users must exist before posts**.
- A follow needs two users, so **users must exist before follows**.
- The feed needs posts *and* follows, so **the feed comes after both**.
- Likes and comments need posts, but nothing needs likes and comments, so **they come last**.

In one line: **people → login → screens → posts → follows → feed → likes and comments → finishing.**

---

### Phase 1 — Set up the project

**What I am building:** an empty project that runs.

No features at all. Just a backend that starts, answers one test request, and successfully connects to an empty database.

**What I am using:** Python, FastAPI, PostgreSQL, Git.

**Why this comes first:** I cannot test anything until the machine is running. If I build features first and the setup is broken, I will not know which part is at fault. Starting with an empty but working system means every problem after this is caused by the thing I just added.

**Finished when:** I open `http://localhost:8000/health` in my browser and see a small JSON response, and the backend starts without any database error.

---

### Phase 2 — Create the users table

**What I am building:** the `users` table in the database. Nothing else.

**What I am using:** SQLAlchemy to describe the table in Python, PostgreSQL to actually create it.

**Why this comes now:** users are the foundation. Almost every other table points at this one. Building it first, on its own, means I can look at it directly in the database and confirm it is exactly right before anything depends on it.

**Finished when:** I open the database myself and see the users table with all its columns.

---

### Phase 3 — Sign up and log in

**What I am building:** three backend features — create an account, log in, and "tell me who I am".

**What I am using:** bcrypt to scramble passwords, JWT to create the login ticket, FastAPI's automatic test page to try it all out.

**Why this comes now:** almost every later feature needs to know who is asking. If I build posts first, I would have to pretend the user is always user number 1, and then rip that fake out of every file later.

**The important idea here:** the internet has no memory. Every request that arrives at my backend arrives as a complete stranger. The backend does not remember that this person logged in ten seconds ago. So the login ticket must be sent again with *every single request*, and checked again *every single time*. That is why the ticket exists.

**Finished when:** using only the automatic test page in my browser, I can create an account, log in, get a ticket, and use that ticket to see my own details. No website yet.

---

### Phase 4 — Build the website and the login screen

**What I am building:** the actual website, with a login page and a signup page that talk to the real backend from Phase 3.

**What I am using:** React, Vite, React Router, Tailwind, Axios.

**Why this comes now:** the backend half already works, so I have something real to connect to. Login is the smallest possible feature that uses *every* part of the system: a form, checking the input, sending a request, storing the ticket, and moving to a new page. Once login works from end to end, every later feature is a smaller version of the same pattern.

**This is the hardest phase.** All the new website ideas arrive at once. It will take longer than the others, and that is normal, not a sign something is wrong.

**Finished when:** I type my details into a real form in the browser, land on a page that only logged-in people can see, and refreshing the page keeps me logged in.

---

### Phase 5 — Posts

**What I am building:** creating a post, viewing a post, deleting my own post, and a profile page showing a user's photo grid.

**What I am using:** the `posts` table, new backend features, and new React pages.

**Why this comes now:** users exist, so posts finally have someone to belong to.

**The important idea here:** ownership. When someone asks to delete post number 12, my backend must check that this person actually wrote post 12. Hiding the delete button on the screen is not enough, because a determined person can send the delete request directly, without ever using my buttons.

**Finished when:** I can add a post by pasting an image link, see it appear on my profile, and delete my own posts but not anybody else's.

---

### Phase 6 — Follow and unfollow

**What I am building:** a follow button, an unfollow button, and follower and following counts on the profile page.

**What I am using:** the `follows` table and new backend features.

**Why this comes now:** this is the step that turns a normal app into a social network. Before this, everyone is alone. After this, users are connected — and that connection is what the feed will read in the next phase.

**The important idea here:** this table points at the same table twice. Learning to think about it clearly is the main lesson of this phase.

**Finished when:** I can follow another user, the counts on both profiles change, and I can unfollow again.

---

### Phase 7 — The home feed

**What I am building:** the home page — posts from the people I follow, newest first.

**What I am using:** the `follows` and `posts` tables joined together in one database question.

**Why this comes now:** it needs both of the previous two phases. It could not be built any earlier.

**The important idea here:** a **join**. A join means combining two tables in one question. Here I am saying: start from the follows table, keep only the rows where I am the follower, then bring in every post written by the people on the other side, newest first, and give me the top twenty.

That one question is the entire product. Real Instagram uses a much cleverer ordering than "newest first", but the shape of the question is the same one I am writing.

**Also in this phase:** the feed loads twenty posts at a time rather than all of them. If a user follows fifty people with hundreds of posts each, loading everything would be slow and pointless — nobody scrolls that far.

**Finished when:** my home page shows posts from people I follow, newest first, and shows a friendly message instead of a blank screen when I follow nobody yet.

---

### Phase 8 — Likes and comments

**What I am building:** a heart button that toggles on and off, and comments under each post.

**What I am using:** the `likes` and `comments` tables.

**Why this comes last of the features:** they are small, and nothing else depends on them. If I run short of time, the app is still a working social network without them. That makes them the safest thing to leave until the end.

**The important idea here:** when I tap the heart, it fills in *immediately*, before the backend has replied. The screen assumes the like will succeed. If the backend then reports a failure, the heart quietly empties again. This makes the app feel instant instead of laggy. The trade-off is that for a fraction of a second the screen is showing something that might not be true — which is acceptable for a like, and would not be acceptable for a payment.

**Finished when:** I can like and unlike a post with no visible delay, and write and read comments.

---

### Phase 9 — Finish the app

**What I am building:** no new features. I go back through everything and make it consistent.

Three things must be true on every screen:

1. **Loading** — while data is on its way, the user sees a loading indicator, never a frozen blank screen.
2. **Empty** — when there is genuinely nothing to show, the user sees a clear message, not a blank space that looks broken.
3. **Error** — when something fails, the user sees a plain message explaining what happened, not a silent failure.

I also check every form rejects bad input on both the website *and* the backend, and I write the project documentation.

**Why this matters:** these three states are the difference between something that works on my machine and something a real person can use. It is also the first thing an experienced developer looks for.

**Finished when:** every screen handles all three states, and someone else could download my project and run it by following my written instructions alone.

---

## 8. Words used in this document

| Word | Simple meaning |
|---|---|
| Backend | The part of the app the user cannot see. Handles rules and data. |
| Frontend | The part the user sees and clicks. Also called the website or client. |
| Database | The permanent storage. Keeps data even when everything is switched off. |
| Table | One kind of thing in the database. Like one spreadsheet sheet. |
| Row | One single record. One user, one post. |
| Column | One field on that record. Email, caption, date. |
| Primary key | The column that uniquely identifies a row. |
| Foreign key | A column pointing at a row in another table. How tables connect. |
| Composite primary key | A key made of two columns together instead of one. |
| Join table | A small table sitting between two others to connect them. |
| Index | A shortcut that makes searching a table fast. |
| Join | Combining two tables in one database question. |
| ORM | A tool that lets me use the database through normal code objects. |
| API | The set of addresses my website can call to get or change data. |
| Endpoint | One single address in that set, e.g. `/api/posts`. |
| Request | The website asking the backend for something. |
| Response | The backend's answer. |
| JSON | The simple text format used to send data between website and backend. |
| Hash | Scrambled text that cannot be turned back. Used for passwords. |
| Token | A signed ticket proving who the user is. Sent with every request. |
| Component | One reusable piece of the website, like a single post card. |
| State | Data the screen is currently holding, e.g. the list of posts. |
| Route | A web address inside my app, e.g. `/profile/john`. |

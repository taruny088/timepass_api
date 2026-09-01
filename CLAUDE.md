# How to work with me

**Current work: Phase 11's side-by-side comparison — done, needs your eyes on a
phone to confirm. Phase 13 done and live (forgot-password confirmed working on
the live site). Next up: Phase 14 — finding things.**
(Phases 11 and 12 done and tested live. Design system: `frontend/src/index.css`.
Shared pieces: `frontend/src/components/ui/`. Alembic is set up with four
migrations applied to the live database; `create_tables.py` must never be used to
change an existing table. Photos live on Cloudinary, `public_id` stored so they
can be deleted. Still owed: the two small changes below, for you to make
yourself.)

**Phase 11's comparison, done 1 September 2026.** The design system passed its
own test outright: no raw colour codes outside `index.css`, no text size off the
six, no drop shadows on cards, one off-scale spacing value. So the differences
were structural, not stylistic, and four were fixed:

- The feed now runs EDGE TO EDGE on a phone. It was a bordered card inside a page
  with 16px padding, which cost 34 of 375 pixels — nine percent of the photo, on
  the one screen the app exists to show photos on. `Card` gained a `flush` prop.
- The profile header was rebuilt to Instagram's shape: only the three counts sit
  beside the avatar, and the display name, bio and button get the full width. The
  bio used to wrap inside a ~250px column.
- The photo grid goes edge to edge too, with a hairline gap instead of 4px.
- `FollowButton` gained `fullWidth`, so a stranger's profile gets the same
  full-width button your own does.

Left alone on purpose: the feed column is `max-w-lg` (512px) against Instagram's
470px, a desktop-only difference, and PLAN2 makes the phone the normal case.

**Email, decided 1 September 2026 — do not re-litigate this by accident.**
No domain is owned, and that is a deliberate choice, not an oversight. Resend's
shared test sender only delivers to `taruny088@gmail.com`, the address the Resend
account is registered to. Mail to anybody else is accepted by the API, reported
as sent, and silently dropped — so a second person can never receive a
verification or password-reset email.

Sending "from taruny088@gmail.com" through Resend is impossible, and no provider
would allow it: authorising a sender means adding DNS records to the domain, and
Google owns gmail.com. The two real fixes, if this is ever revisited, are buying
a domain (no code changes at all — verify it with Resend and set `EMAIL_FROM`) or
sending through Gmail's own SMTP with an App Password (free, needs a new sender
using the standard library's `smtplib` in place of the Resend call).

Verification and reset use a clickable LINK, not a typed OTP. Also considered and
declined. The `email_tokens` table supports either; only the pages and wording
would change.

No email is ever sent for likes, comments or follow requests. Phase 15's
notifications are the in-app bell and list only.
(Keep this line up to date. It is the first thing to read at the start of a session.)

## My situation
- I am learning this stack while building. I am new to React and to full-stack work.
- My goal is to understand this project well enough to explain, change and debug it
  on my own. A working app is the outcome; understanding is the point.
- Do not generate the whole project. Do not build ahead of where I am.

## The plan
There are two plan documents. Read the one that covers the phase we are on before
starting it.

- **PLAN.md** — phases 1 to 9. Already built. The goal, the database design and the
  original nine features. Read it for history and for how the app already works.
- **Phase 10 — deployment.** Done. Never written up as a document. The app is live on
  Render: the website, the backend and the database.
- **PLAN2.md** — phases 11 to 17. This is the current work: interface, uploads,
  account and profile, discovery, activity and privacy, messaging, stories.

Follow the phase order and do not skip ahead. If something I ask for contradicts the
plan, tell me before doing it. Where PLAN.md and PLAN2.md disagree, **PLAN2.md wins** —
it is the newer decision.

## Before writing any code
- Show me a plan first: which files you will create or change, and what each one
  is responsible for. Then stop and wait for me to approve.
- If my request is unclear, or could reasonably be done in more than one way,
  ask me before choosing.

## Pace
- Work on one phase at a time. Never move to the next feature until I say so.
- Some phases are split into **sittings** — 11a, 11b, 11c and 16a, 16b, 16c. A sitting
  is one work session with its own finishing line. Do one sitting at a time.
- A sitting is not finished until it is committed and pushed. Do not start the next
  sitting until the previous one is pushed and I say to go on.
- Inside a phase, go file by file. Explain each file before moving to the next.
- If I ask for something that skips ahead of the current phase, tell me instead
  of doing it.

## Everything must be dynamic
Nothing on any screen is written into the code.

- Follower counts, following counts and post counts are counted from the database.
  Never a fixed number typed into the frontend.
- Badges, suggestions, explore posts and lists all come from real queries.
- Empty screens say something useful because the query came back empty — not because
  a placeholder was left behind.
- No sample text, no "Lorem ipsum", no demo user, no test data hardcoded anywhere.

The test: if something needs a code change to show up, it was not dynamic.

## A phase is not done until it is live
The app is deployed. Working on my laptop is not finished. A phase or sitting is
finished only when all four are true:

1. It works locally.
2. It is committed and pushed to GitHub.
3. Render has finished rebuilding both the website and the backend.
4. It has been tested again **on the live address**, including on a phone.

Do not tell me a phase is complete before step 4. Things break in production that never
break locally — missing settings, cold starts, slow photos.

## Design rules
These apply from Phase 11 onward.

- Colours, fonts, text sizes and spacing live in **one configuration file**. Never write
  a raw colour code inside a component.
- Every gap is a multiple of 4 pixels: 4, 8, 12, 16, 24, 32, 48. Nothing in between.
- Only the six approved text sizes in PLAN2.md. No new ones.
- **Mobile first**: write the phone layout as the normal case, then add rules for bigger
  screens with Tailwind's `sm:`, `md:` and `lg:` prefixes. Never the other way round.
- Build shared pieces once — button, input, card, avatar, modal, spinner, empty state —
  and reuse them. Do not rewrite the same button on each page.
- Every icon needs a hidden text label so screen readers can describe it.

## Branding boundary
The name and the gradient are mine. Instagram's grey and white neutrals are fine to copy
and are most of what creates the familiar feel.

**Never use Instagram's logo, their exact brand gradient, or their icon set.** A login
page on a free host carrying a famous brand is what got the first deployment blocked by
Chrome as a "Dangerous site" — it looks exactly like a fake page built to steal passwords.

Treat this as a hard rule. If I ask for it casually, say no and remind me why.

## Database changes
These apply from Phase 12 onward, when we first change a table that already exists.

- Never change a live table by hand.
- Never rely on `create_tables.py` for a change to an existing table. It creates missing
  tables and **silently does nothing** about changes to existing ones — no error, no
  warning, and then the code and the live database quietly disagree.
- Every change to an existing table goes through an **Alembic migration**: a numbered
  file recording the change, which can be applied forward or rolled back.
- Explain in plain English what a migration will do before running it.

## Explaining things
- Use simple, plain English. Avoid heavy technical words.
- If you must use a technical term, explain it in one or two plain sentences the
  first time it appears.
- Whenever you use a library, decorator, ORM method, JWT function, middleware or
  React concept I may not know, explain: what it is, why we need it here, what
  problem it solves, and where it is used in this project.
- After writing code, explain the important parts of what you wrote.
- Do not skip an explanation because it seems obvious.

## Errors
When something breaks:
1. Explain what the error message means in plain English.
2. Say what most likely caused it.
3. Show me how to confirm that is the cause.
4. Fix it.
5. Explain why the fix works.
6. Tell me how I could recognise and debug this kind of problem myself.
Never just give me a command to paste without explaining it.

## Code style
- Clean, simple, beginner-readable code. No clever tricks.
- No extra layers, patterns or abstractions unless I need them now.
- Meaningful names.
- Keep frontend, backend and database responsibilities clearly separated.

## Safety basics
- Never store plain-text passwords.
- Keep secrets and database credentials in environment variables, never in code.
- Validate user input.
- Handle expected errors properly.

For uploads:
- Check a file's real type by reading the file itself, never by trusting its name.
  Anyone can rename a file.
- Always enforce a size limit. This is a security measure, not a convenience.

For password reset:
- Give the **same reply** whether or not the email exists. Saying "no account with that
  email" tells a stranger which addresses are registered.
- Store reset codes hashed, like passwords.
- Codes expire within an hour, and work only once. Both are needed, not either alone.
- Changing a password while logged in requires the current password.

For anything private:
- Permission is checked **in the backend, on every request**. Hiding a link or a button
  in the interface is not a check. A private message shown to a stranger is a serious
  failure, not a bug.

## Boundaries
- Do not silently change parts of the project I did not ask about.
- The libraries already named in PLAN2.md — `lucide-react`, Cloudinary, Resend and
  Alembic — are approved. Still explain each one in plain English before its first use.
- Any library or tool **not** in PLAN2.md needs my approval first, with the reason.
- If you think I am about to make a mistake, say so directly.

## Live environment facts
- Render wipes the server's own disk on every restart and every deploy. Anything saved
  there disappears with no explanation. Uploaded photos go to Cloudinary; only the link
  is stored in the database.
- The backend sleeps after 15 minutes with no visitors and takes up to a minute to wake.
- Secrets live in Render's environment settings, never in the code.
- The free database is deleted on **29 September 2026**. Anything worth keeping must be
  exported, or the plan upgraded, before then.

## After each phase
- Give me one small change to make myself, so I can check I understood it.
- For the phases split into sittings (11 and 16), do this at the end of **each sitting**,
  not just at the end of the phase.

# Timepass — Build Plan, Round Two

**This replaces every earlier round-two document.** Same work as before, reorganised: fewer phases, each one covering a whole area rather than a slice of it, and the interface first because that is the priority.

---

## 1. What I am doing

The app is built and live on the internet. This round makes it look and behave like a real social app.

**The name is mine. The behaviour is Instagram's.** The layout, the buttons, the interactions, the feel of scrolling a feed — copied closely and on purpose. Not copied: Instagram's logo, exact colours and icon set. Those belong to Meta, and using them is what got the first deployment blocked by Chrome as a "Dangerous site" — a login page on a free host carrying a famous brand name looks exactly like a fake page built to steal passwords.

---

## 2. Everything asked for, and where it happens

| What I asked for | Where |
|---|---|
| Same theme as Instagram, different name and symbol | Phase 11a |
| Symbol in the header, no name | Phase 11a |
| Clear interface like Instagram | Phase 11a and 11b |
| Good, engaging interface | All of Phase 11 |
| Mobile view | Phase 11b |
| Upload photos directly, not links | Phase 12 |
| Several photos per post | Phase 12 |
| Profile photo | Phase 12 and 13 |
| Edit profile | Phase 13 |
| Email verification when signing up | Phase 13 |
| Forgot password and reset by email | Phase 13 |
| Explore, suggestions, hashtags, saved posts | Phase 14 |
| Notifications, private accounts | Phase 15 |
| Real-time messaging, no refreshing | Phase 16 |
| Side-by-side match with the real app | Checked at the end of Phase 11 |

**Not being built:** Reels, video of any kind, audio, live streaming, filters, shopping, ads. Every photo in this app is a still image. Anything on this list would need a different kind of storage, a different kind of player, and a different set of skills — and none of it was asked for.

---

## 3. Two rules that apply to every phase

### Everything is dynamic

Nothing on any screen is written into the code. Every number, name, photo and list comes from the database through the API, and changes by itself when the data changes.

Concretely, that means:

- Follower counts, following counts and post counts are counted from the database, never stored as fixed numbers in the frontend.
- The unread badge on the bell shows a real count from a real query.
- Suggested accounts come from real users, not a hand-written list.
- Explore shows real posts.
- Empty screens say something useful drawn from the actual situation — "No posts yet" appears because the query returned nothing, not because a placeholder was left behind.
- No sample text, no "Lorem ipsum", no demo user hardcoded anywhere.

**How to check:** create a second account, make a post, and confirm it appears everywhere it should without anyone editing a file. If something needs a code change to show up, it was not dynamic.

### Every phase ends live

The app is deployed, so a phase is not finished when it works on the laptop. Each phase ends with:

1. It works locally.
2. Committed and pushed to GitHub.
3. Render finishes rebuilding both the website and the backend.
4. **Tested again on the live address**, including on a phone.

Things break in production that never break locally — missing settings, cold starts, slow photos. Finding that out at the end of each phase is far easier than finding it out at the end of everything.

---

## 3. The phases

Six phases, one optional. Each covers a complete area, so related work happens together instead of being spread across the plan.

| Phase | Area | Size | Status |
|---|---|---|---|
| 11 | The entire interface | Large — split into three sittings | done |
| 12 | Photos and uploads | Medium | done |
| 13 | Account and profile | Medium | done |
| 15 | Activity and privacy | Medium | **next** |
| 16 | Messaging | Large — split into three sittings | |
| 14 | Finding things | Medium | moved to last — see below |
| 17 | Stories | Optional | |

**PHASE 14 WAS MOVED TO THE END, decided 1 September 2026.** The numbering is
deliberately left alone, so everything already written about Phase 14 still
refers to the same phase. Only the ORDER changed.

Nothing depends on it, which is what makes this safe. Phase 15 needs likes,
comments and follows; Phase 16 needs follows. Neither touches Explore, hashtags
or saved posts, and no table Phase 14 would add is read by anything else.

What it costs in the meantime: finding people still works — `search.py` has done
user search since before Phase 11 — but it means typing a username rather than
browsing. That makes Phases 15 and 16 fiddlier to DEMONSTRATE, since both want
two accounts that follow each other. It does not make them harder to build.

---

## PHASE 11 — The entire interface

**This is the priority phase, and everything about the look happens here.** Name, logo, colours, icons, typography, layout, mobile, dark mode and the small interaction details — all together, because changing any one of them affects the others. Doing them separately would mean touching the same files three times.

Large enough to split into three sittings. Do not start the next sitting until the previous one is finished and pushed.

### 11a — Identity and design system

**What I am building:** the foundation everything else uses.

- The name Timepass everywhere. "Insta Clone" gone from every screen.
- The logo in the header in place of text, and as the browser tab icon.
- The colour scheme, typography and spacing written into one configuration file.
- Dark mode, remembered between visits.

**The colours**

Worth understanding before choosing anything: **Instagram's interface is almost entirely grey and white.** The famous gradient appears in exactly two places — the logo, and the ring around a profile picture with an unseen story. Everything else is white background, near-black text, mid-grey secondary text, light-grey borders, one blue for buttons and links, and one red for the heart.

So "using Instagram's colours" mostly means using their *neutrals*, and those are what actually create the familiar feel. Greys and near-blacks belong to nobody. These are taken directly from Instagram and should be used as-is.

Light theme:

| Use | Colour |
|---|---|
| Page background | `#FFFFFF` |
| Secondary background | `#FAFAFA` |
| Main text | `#262626` |
| Secondary text | `#8E8E8E` |
| Borders and dividers | `#DBDBDB` |
| Buttons and links | `#0095F6` |
| Like / heart | `#ED4956` |
| Error | `#ED4956` |

Dark theme:

| Use | Colour |
|---|---|
| Page background | `#000000` |
| Secondary background | `#121212` |
| Main text | `#F5F5F5` |
| Secondary text | `#A8A8A8` |
| Borders | `#262626` |
| Buttons and links | `#0095F6` |

Note the main text is `#262626`, not pure black, and dark mode is true black. Both are deliberate choices on Instagram's part and both are worth copying — softened black is easier to read, and true black makes photos glow on a phone screen.

**The one place to be different: the gradient.**

The gradient is the single most recognisable part of Instagram's identity — more recognisable than the logo shape itself. It is also the one element that would make someone glancing at the screen think this *is* Instagram rather than an app that looks like it. That matters more now that there is a login form on a free host, which is what triggered the Chrome warning in the first place.

So the neutrals are Instagram's, and the gradient is ours — used in the same two places theirs appears, the logo and the story ring:

| Position | Colour |
|---|---|
| Start | `#06B6D4` cyan |
| Middle | `#6366F1` indigo |
| End | `#D946EF` fuchsia |

This costs nothing visually. The gradient covers perhaps two percent of the screen. The other ninety-eight percent is the neutral scale above, which is identical to Instagram's.

**The typography**

Two typefaces, both free from Google Fonts.

- **Inter** for everything in the interface. It is designed for screens at small sizes, and it is deliberately quiet. In a photo app the photos are the hero; the text around them should not compete.
- **Outfit** for the word "Timepass" on the login and signup pages only. One characterful face, used in one place, gives the app a voice without making it noisy.

Text sizes — six, no more. An app with fourteen slightly different text sizes looks accidental.

| Use | Size | Weight |
|---|---|---|
| Page heading | 24px | 600 |
| Section heading | 18px | 600 |
| Body | 15px | 400 |
| Username / emphasis | 14px | 600 |
| Secondary text | 13px | 400 |
| Timestamps, counts | 12px | 400 |

**Spacing**

Every gap is a multiple of 4 pixels: 4, 8, 12, 16, 24, 32, 48. Nothing in between. This is the single easiest way to make a layout look intentional rather than nudged into place.

**Corners and shadows**

Corner rounding: 8px on buttons and inputs, 12px on cards, fully round on profile pictures. Shadows used sparingly — a card sits on the page with a border, not a drop shadow. Instagram is almost entirely flat, and that is why photos stand out.

**Finished when:** "Insta Clone" appears nowhere, the logo shows in the header and tab, the colours and fonts come from one file, and dark mode works and is remembered after a refresh.

---

### 11b — Icons, components and mobile layout

**What I am building:** every screen rebuilt on the new foundation, working on a phone.

- Icons instead of words in the navigation and under posts, using `lucide-react` — a free, open icon set installed as a package and used as code.
- One set of shared pieces reused everywhere: button, input, card, avatar, modal, spinner, empty state. Built once, used on every page.
- On a phone: a bar of icons along the bottom. On a laptop: along the top.
- Feed in one column. Profile grid narrowing as the screen does. Buttons big enough for a thumb. No sideways scrolling anywhere.

**Why the shared pieces matter:** without them, the same button gets written slightly differently on nine pages, and the ninth one is always the odd one out. With them, a change happens once.

**Mobile first** means writing the phone layout as the normal case and adding rules for bigger screens, using Tailwind's `sm:`, `md:` and `lg:` prefixes. The other way round always produces a phone layout that feels like an afterthought, because it is.

**Finished when:** every page works at 375 pixels wide with no sideways scrolling, the navigation uses icons and moves to the bottom on a phone, and the same button looks the same everywhere. Tested in the browser's device view *and* on a real phone.

---

### 11c — The details that make it feel real

**What I am building:** the small things people notice without knowing they notice.

- Times as "2h ago" and "3d ago", not full dates.
- Double-tapping a photo likes it, with a heart that appears and fades.
- Long captions cut off with a "more" link.
- A proper page for a single post, photo beside comments.
- Follower and following lists opening in a box on top of the page.
- Every image having a placeholder shape while it loads, so the page does not jump about.
- Every button showing it has been pressed, immediately.

**Why this is part of the interface phase and not a separate one:** these are what separate an app that works from an app that feels finished. Every feature could be present and the app would still feel like a school project with a raw date stamp and no double-tap.

**Finished when:** posts show relative times, double-tapping likes, long captions collapse, a single post opens on its own page, and nothing on the screen jumps while loading.

**New things to learn across Phase 11:** what a design token is and why a colour belongs in one place; how an icon library works as code rather than image files; why every icon needs a hidden text label for screen readers; what mobile-first means; how to turn a stored date into "2 hours ago" and why that belongs on the frontend; how to detect a double tap, which the browser does not provide directly; and how an optimistic update makes the heart fill instantly instead of after a delay.

---

### The check that ends Phase 11

Open the real Instagram on a phone. Open Timepass on another phone, or in the browser's device view, beside it. Compare screen by screen: feed, profile, single post, comments.

For each one, note every difference — spacing that is too loose, text that is too large, a button in the wrong corner, a photo that is not square. Fix the list.

**What should look the same:** layout, spacing, text sizes, where things sit, how they behave when tapped.

**What should look different:** the name, the symbol, and the gradient. Nothing else.

This comparison is the point of the whole phase. Without it, the app ends up "roughly like Instagram", which is what almost every clone ends up as. With it, someone glancing at the screen sees a real app.

---

## PHASE 12 — Photos and uploads

**Everything to do with images, in one phase.** Uploading, storing, several photos per post, and profile pictures.

**What I am building:**

- Choosing a photo from the device instead of pasting a link.
- A post holding up to ten photos, swiped left and right with dots underneath — the Instagram carousel.
- Profile pictures uploaded the same way.
- A progress indicator while uploading, since photos take real time.

**What I am using:** Cloudinary's free plan for storage, a new `post_media` table, and Alembic.

**Why an outside storage service is necessary:** any file saved onto Render's own disk is deleted every time the service restarts — which happens on every deploy and every wake from sleep. Photos would quietly vanish with nothing to explain why. So the file goes to Cloudinary and only the link it returns is stored in the database.

**Why Alembic starts here.** This phase changes an existing table for the first time: `image_url` moves off `posts` and into the new `post_media` table. The current `create_tables.py` creates missing tables and nothing else — it will happily create `post_media` and then **silently do nothing** about the change to `posts`. No error, no warning, and the code and the live database quietly disagree. On a laptop that is fixable by starting over. On the live database, with real accounts and posts in it, that is not an option.

Alembic records each change as a numbered file that can be applied forward or rolled back. **Set it up as the first task of this phase**, before touching any table.

**What to decide:** existing posts hold pasted links. On a demo app with a handful of test posts, clearing them out is simpler than supporting both formats.

**New things to learn:** how a browser sends a real file rather than text; why the file type must be checked by reading the file itself and never by trusting its name, since anyone can rename a file; why a size limit is a security measure and not a convenience; what an ephemeral filesystem is; what a migration is and why a recorded change is safer than a manual one; why the order of photos in a post has to be stored rather than assumed.

**Finished when:** a photo chosen from a phone appears in the app and survives a backend restart; a post can hold several photos that swipe in the right order; profile pictures upload the same way; and the table change reached the live database through a migration rather than by hand.

---

## PHASE 13 — Account and profile

**Everything to do with a user's own account, in one phase.**

**What I am building:**

- An edit page reached from the profile: display name, bio, profile picture.
- Email verification when signing up: a new account gets a confirmation link and stays unverified until it is clicked.
- Change password, for someone already logged in.
- Forgot password: an emailed reset link and a page to set a new one.

**Why verification and reset belong together:** both send a one-time code by email and check it when the link is clicked. The same table, the same email setup and the same rules cover both. Building them apart would mean building the same machinery twice.

**What "unverified" should mean:** an unverified account can log in and look around, but cannot post, comment or follow. Blocking login entirely is harsher than Instagram and makes the app annoying to demonstrate. A banner at the top with a "resend email" button is the usual approach.

**What I am using:** Resend for sending email, and one new table holding reset codes.

**How a password reset actually works:**

1. The user enters their email address.
2. The app creates a long random code, saves it with an expiry time and the user it belongs to, and emails a link containing it.
3. The user clicks the link and types a new password.
4. The app checks the code exists, has not expired and has not been used, saves the new password, and marks the code used.

**The rules that matter, and why:**

- **The same message appears whether or not the email exists.** Saying "no account with that email" tells a stranger which addresses are registered.
- **Codes expire**, within an hour. An old link found in an inbox later must not work.
- **A code works once.** After use it is dead, so a forwarded or leaked link is useless.
- **Changing a password while logged in requires the current password.** Otherwise anyone borrowing an unlocked laptop takes the account permanently.
- **The code is stored hashed**, like a password. A stolen database should not hand over working reset links.

**One thing to check before starting:** Resend's free plan sends 3,000 emails a month, capped at 100 a day, from one verified domain. Sending from a real domain means owning one. Without a domain, Resend's test sender will normally only deliver to your own registered address — fine for building and demonstrating, but confirm it before assuming a friend can receive a reset email.

**New things to learn:** why `PATCH` is right for changing part of a record while `PUT` means replacing all of it; how to update only the fields that were sent instead of blanking the rest; what transactional email is and why an app never sends mail itself; why a reset code is treated as a password; what an enumeration attack is and how the identical-message rule prevents it; why expiry and single use are both needed rather than either alone.

**Finished when:** name, bio and photo can be changed and appear everywhere; a password can be reset by email end to end; the reset link stops working after use and after expiry; and a logged-in user can change their password only by supplying the current one.

---

## PHASE 14 — Finding things

**Everything to do with discovery, in one phase.** This fixes the emptiest problem in the app: a brand-new account sees a blank feed and has no way to find anybody.

**What I am building:**

- An explore page: a grid of recent posts from people the user does not follow.
- Suggested accounts to follow.
- Hashtags in captions, clickable, each with its own page listing its posts.
- Improved user search, and search by hashtag.
- A bookmark button saving posts to a private list on the profile.

**What I am using:** three new tables — `saved_posts`, `hashtags`, and a join table linking hashtags to posts. All new tables, so no migration difficulty, though Alembic is already set up from Phase 12 and should be used.

**New things to learn:** how to write a query for "posts by people I do *not* follow", which is harder than the feed query; how a suggestion list can be built from simple rules with nothing resembling a recommendation algorithm; how to pull hashtags out of a caption as it is saved; why a saved post is private while a liked post is public.

**Finished when:** a brand-new account can open Explore, find people, follow them, tap a hashtag and see its posts, and save posts to a list only they can see.

---

## PHASE 15 — Activity and privacy

**Everything to do with what other people did, in one phase.**

**What I am building:**

- A bell icon with a real unread count.
- A list of activity, newest first: likes, comments, follows.
- A private account setting. When it is on, new followers must be approved.
- Follow requests appearing in the same activity list, with approve and decline buttons.

**What I am using:** one new `notifications` table, and a status column added to the existing `follows` table — pending or accepted.

**Why these belong together:** approving a follow request happens in the notification list. Building notifications first and private accounts later would mean building that list twice.

**The change to `follows` is a second existing-table change**, so Alembic is used again. It also touches every place that reads posts, because each must now check whether the viewer is allowed to see them.

**New things to learn:** why a notification row is written at the moment the like or follow happens rather than worked out later by searching; why a user must never be notified about their own actions; what happens to a notification when the post it refers to is deleted; and how permission that depends on a *relationship* differs from permission that depends on *ownership*, which is what every check so far has been.

**Finished when:** likes, comments and follows notify the right person; unread ones are counted and clear when opened; a private account's posts are hidden from non-followers; and follow requests can be approved or declined.

---

## PHASE 16 — Messaging

**The largest phase in the project.** Bigger than anything in Phases 1–9. Three sittings.

**What I am building:** private conversations between two people who follow each other.

**What I am using:** two new tables, `conversations` and `messages`, plus a WebSocket for live delivery.

**What a WebSocket is:** every request so far has worked the same way — the browser asks, the server answers, the connection closes. That means the server can never tell the browser anything on its own. A WebSocket is a connection that stays open in both directions, so the moment a message is saved the server can push it straight to the other person's screen. No refreshing, no waiting.

**The simpler alternative, and what it costs:** the browser could instead ask "anything new?" every three seconds. That also delivers messages with no refreshing, and it uses only what has already been learnt. The difference is a delay of up to three seconds, and a lot of pointless requests when nothing is happening. If the WebSocket work stalls, this is the fallback that still meets the requirement.

**The complication to plan for:** the free Render service sleeps after fifteen minutes with no visitors, and a sleeping server drops every open connection. So the frontend must notice a dropped connection and reconnect by itself, and must fetch any messages missed while it was disconnected. Reconnection is not an optional extra here — without it the chat silently stops working and looks broken.

| Sitting | Content |
|---|---|
| 16a | The two tables, plus endpoints to start a conversation, send a message and list messages |
| 16b | The conversation list screen and the single conversation screen |
| 16c | The WebSocket: live delivery, reconnecting after a drop, unread indicators |

**The rule that must not be broken:** a person may only read a conversation they are part of, checked in the backend on every request — not merely by hiding links in the interface. A post deleted by the wrong person is a bug. A private message shown to a stranger is a serious failure.

**New things to learn:** how to store a conversation so the same pair never ends up with two separate threads; why a message list is ordered and loaded differently from a feed; how a WebSocket differs from an ordinary request and why a normal request cannot be pushed from the server; why a dropped connection must be detected and rebuilt; how to check permission on something owned by two people rather than one.

**Finished when:** two accounts hold a conversation, each sees the other's messages within seconds, and a third account is refused access even when asking directly.

---

## PHASE 17 — Stories (optional)

Photos that disappear after 24 hours, shown as circles across the top of the feed, tapped through one at a time.

The interesting part: nothing is deleted on a timer. A story simply carries an expiry time, and every query ignores rows past it. Removing old rows afterwards is a separate housekeeping job, not the mechanism that makes them disappear.

*Size: large. New ideas: content with a lifespan, and a full-screen tap-through viewer.*

---

## 4. Practical notes

**The free database is deleted on 29 September 2026.** A short grace period, then everything goes — every account, post and message. Export anything worth keeping, or upgrade the plan.

**The backend sleeps after 15 minutes with no visitors** and takes up to a minute to wake. Open the app a few minutes early before showing anyone.

**Keep a demo account ready** — filled profile, several posts, follows, comments. An empty app demonstrates badly, and making content live in front of people wastes their time.

**Commit at the end of every sitting, not just every phase.**

---

## 5. Stopping points

| After | The app is |
|---|---|
| Phase 11 | Good-looking, mobile-ready, and feels finished |
| Phase 12 | Actually usable — real photos, not pasted links |
| Phase 13 | Complete as a normal account-based product |
| Phase 15 | A full social app |
| Phase 16 | A full social app with messaging |

Phase 11 alone is the biggest single improvement available, which is why it is first.

import { House, LogOut, Search, Send, SquarePlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useSocket } from '../realtime/SocketContext'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import VerifyBanner from './VerifyBanner'
import Avatar from './ui/Avatar'
import Badge from './ui/Badge'

// The bar across the top of every logged-in page.
//
// WHAT CHANGED IN 11b. This used to be six text buttons in a row, which needed
// about 445 pixels and so scrolled the page sideways on a phone. The 11a fix
// was flex-wrap -- it stopped the scrolling but left an ugly two-line header.
//
// This is the real answer, and it is the one Instagram uses:
//
//   On a phone   the top bar carries only the logo and two controls, and the
//                navigation moves to BottomNav, where your thumb is.
//   On a laptop  the navigation comes back up here, because there is width for
//                it and no thumb to reach with.
//
// Written MOBILE FIRST: the plain classes describe the phone, and md: adds what
// changes on a bigger screen. Tailwind's prefixes only ever mean "this size and
// up", so there is no way to write the desktop case first without fighting it.
export default function Header() {
  const { user, logout } = useAuth()
  const { subscribe } = useSocket()
  const navigate = useNavigate()

  // PHASE 16c: the unread badge on the messages icon.
  //
  // It lives in Header rather than on the messages page because that is the
  // whole point of it -- you need to know a message arrived while you are
  // somewhere else. Header is already on every logged-in page.
  const [unreadConversations, setUnreadConversations] = useState(0)

  useEffect(() => {
    // The same race guard used on every screen that fetches: if this component
    // goes away while a request is in flight, throw the answer away rather
    // than setting state on something that no longer exists.
    let ignore = false

    function load() {
      api
        .get('/conversations/unread-count')
        .then((response) => {
          if (!ignore) setUnreadConversations(response.data.unread_conversations)
        })
        // Quiet on purpose. A badge that fails to load is not worth an error
        // box across the top of every page in the app.
        .catch(() => {})
    }

    // Once when the page opens, because the live connection only reports
    // CHANGES -- it knows nothing about what happened before you arrived.
    load()

    // ASK THE SERVER AGAIN RATHER THAN COUNTING HERE.
    //
    // Adding one to the number when a message arrives would be faster and
    // would be wrong. The badge counts CONVERSATIONS with something unread, so
    // a second message in a chat that is already unread must not move it --
    // and working that out in the browser means keeping a copy of which
    // conversations are unread, which drifts the moment two tabs are open.
    //
    // The database already knows the answer, so it is asked. That is the
    // "everything is dynamic" rule applied to a number that badly wants to be
    // a local variable.
    //
    // One small request per event is fine at this app's volume. If a chat ever
    // got busy enough for this to feel wasteful, the fix is to wait half a
    // second and collapse a burst of events into one request -- not to start
    // keeping the count here.
    const unsubscribe = subscribe((event) => {
      // Your own message is not unread to you, and the server pushes it to
      // your other devices too. Without this line, sending a message would
      // briefly light up your own badge.
      if (event.type === 'message.new' && event.message.sender_id === user.id) {
        return
      }

      if (event.type === 'message.new' || event.type === 'message.read') load()
    })

    return () => {
      ignore = true
      unsubscribe()
    }
  }, [subscribe, user.id])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    // A FRAGMENT -- <>...</> -- because this component now returns two things
    // side by side, and a component may only return one. A fragment groups
    // them without adding a real <div> to the page, which would otherwise sit
    // between the header and the content and interfere with the sticky
    // positioning below.
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          {/* The symbol, and no name beside it. Instagram does the same, and it
              is not decoration: dropping the word buys back width a phone screen
              does not have. The symbol still says the app's name to a screen
              reader, through the aria-label inside Logo. */}
          <Link to="/">
            <Logo className="h-8 w-8" />
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main">
            {/* hidden on a phone, shown from md: up.
                These four are exactly what BottomNav carries, which is why they
                are hidden here -- showing both would be the same navigation
                twice on the same screen. */}
            <div className="hidden items-center gap-1 md:flex">
              <IconLink to="/" icon={House} label="Home" end />
              <IconLink to="/search" icon={Search} label="Search" />
              <IconLink to="/create" icon={SquarePlus} label="New post" />
              <IconLink
                to={`/profile/${user.username}`}
                label="My profile"
                avatar={user}
              />
            </div>

            {/* MESSAGES SITS HERE, NOT IN BottomNav, and that is deliberate.
                The obvious move is a fifth item in the bottom bar. Instagram
                does not do that -- their bottom bar has a fixed set, and direct
                messages live at the TOP RIGHT of the home screen, in a corner
                of their own.

                Two reasons to copy that. It is what the Phase 11 comparison
                spent a sitting matching, and a fifth item would squeeze four
                comfortable thumb targets into five cramped ones at 375px.

                Shown at every screen size, unlike the four navigation icons
                above, because on a phone there is nowhere else for it to go. */}
            {/* `relative` on the wrapper is what the badge positions itself
                against -- an absolutely positioned element lines itself up
                with the nearest ancestor that is positioned, and without this
                it would fly to the corner of the whole page.

                pointer-events-none so the badge cannot swallow a tap. It sits
                on top of the link, and without it the one place people
                naturally aim -- straight at the number -- would be the one
                place that does not open the messages. */}
            <span className="relative">
              <IconLink to="/messages" icon={Send} label="Messages" />
              <Badge
                count={unreadConversations}
                label="conversations with unread messages"
                className="pointer-events-none absolute right-1 top-1"
              />
            </span>

            {/* These two stay on every screen size. They are not navigation --
                they act on the app itself -- so they do not belong in a bar of
                places you can go. */}
            <ThemeToggle />

            <button
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition active:scale-90 hover:bg-hover hover:text-ink"
            >
              <LogOut className="h-6 w-6" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </header>

      {/* Under the bar rather than inside it, so it scrolls away with the
          page. Inside the sticky header it would hold a strip of every screen
          hostage on a phone, permanently, on every page.

          It lives in Header because Header is already on every logged-in page.
          Adding it to each page by hand would mean the one page somebody
          forgets is the page where an unverified user never learns why posting
          does not work. VerifyBanner draws nothing at all when the address is
          confirmed. */}
      <VerifyBanner />
    </>
  )
}

// One navigation icon in the top bar. Same idea as BottomNav's NavItem, but a
// row item rather than a stretched tab, so it is written separately rather than
// contorting one component to be both.
function IconLink({ to, icon, label, avatar, end = false }) {
  const Icon = icon

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-11 min-w-11 items-center justify-center rounded-control transition hover:bg-hover ${
          isActive ? 'text-ink' : 'text-ink-muted'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {avatar ? (
            <Avatar
              src={avatar.avatar_url}
              username={avatar.username}
              size="sm"
              className={isActive ? 'ring-2 ring-ink' : ''}
            />
          ) : (
            <Icon
              className="h-6 w-6"
              fill={isActive ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
          )}
          <span className="sr-only">{label}</span>
        </>
      )}
    </NavLink>
  )
}

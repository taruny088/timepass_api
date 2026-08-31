import { House, LogOut, Search, SquarePlus } from 'lucide-react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import Avatar from './ui/Avatar'

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
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
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

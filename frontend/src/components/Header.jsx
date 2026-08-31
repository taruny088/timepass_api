import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'

// The bar across the top of every logged-in page.
//
// It exists because four pages now need the same thing. Your CLAUDE.md says
// not to add layers until they are needed -- with two copies it would be
// premature, with four it has stopped being premature. Without this, changing
// a link means remembering to change it in four files, and forgetting one.
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
        {/* The symbol, and no name beside it.
            Instagram does the same, and it is not decoration: dropping the
            word buys back the width a phone screen does not have. The symbol
            still has to say the app's name to a screen reader, which is what
            the aria-label inside Logo is for. */}
        <Link to="/">
          <Logo className="h-8 w-8" />
        </Link>

        {/* flex-wrap is what stops the whole page scrolling sideways on a phone.
         *
         * A flex item can shrink, but never below its min-content width -- the
         * longest single word inside it plus its padding. Six text buttons hit
         * that floor at roughly 380px, and with the logo and the outer padding
         * the row needs about 445px against a 375px screen. The extra 70px is
         * what you were scrolling to reach.
         *
         * The header itself was never cut off, by the way. It is a block
         * element, so it paints exactly the width of the screen; it was the nav
         * inside that escaped it, which is why scrolling right ran off the end
         * of the header background.
         *
         * flex-wrap lets the row fall onto a second line instead of forcing the
         * page wider. The header gets taller on a phone, which is not pretty --
         * but nothing is cut off and nothing scrolls sideways.
         *
         * This is a stopgap, on purpose. 11b replaces this row with a bar of
         * icons along the bottom on a phone, which is the real answer. */}
        <nav className="flex flex-wrap items-center justify-end gap-2">
          {/* The logo above already links home, but a logo is not an obvious
              button to everyone. An explicit link costs nothing. */}
          <Link
            to="/"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-hover"
          >
            Home
          </Link>

          <Link
            to="/search"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-hover"
          >
            Search
          </Link>

          <Link
            to="/create"
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition hover:bg-accent-hover"
          >
            New post
          </Link>

          {/* Builds the address for the logged-in user's own profile.
              This is the same route that shows anybody else's profile --
              one page, different data, decided by the name in the URL. */}
          <Link
            to={`/profile/${user.username}`}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-hover"
          >
            My profile
          </Link>

          <ThemeToggle />

          <button
            onClick={handleLogout}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-hover hover:text-ink"
          >
            Log out
          </button>
        </nav>
      </div>
    </header>
  )
}

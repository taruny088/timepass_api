import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

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
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-xl font-bold text-slate-900">
          Insta Clone
        </Link>

        <nav className="flex items-center gap-2">
          {/* The logo above already links home, but a logo is not an obvious
              button to everyone. An explicit link costs nothing. */}
          <Link
            to="/"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Home
          </Link>

          <Link
            to="/search"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Search
          </Link>

          <Link
            to="/create"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            New post
          </Link>

          {/* Builds the address for the logged-in user's own profile.
              This is the same route that shows anybody else's profile --
              one page, different data, decided by the name in the URL. */}
          <Link
            to={`/profile/${user.username}`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            My profile
          </Link>

          <button
            onClick={handleLogout}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Log out
          </button>
        </nav>
      </div>
    </header>
  )
}

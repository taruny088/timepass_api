import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// The page only logged-in people can see.
//
// It is deliberately almost empty. The real home page -- posts from the people
// you follow, newest first -- is Phase 7, and it cannot be built until posts
// (Phase 5) and follows (Phase 6) exist. What matters here is only that this
// page is unreachable without a valid token, and that a refresh keeps you on it.
export default function Home() {
  // ProtectedRoute has already guaranteed user is not null by the time this
  // component draws, so there is no need to check again.
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold text-slate-900">Insta Clone</h1>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">
            Hello, {user.username}
          </h2>

          {user.full_name && (
            <p className="mt-1 text-slate-600">{user.full_name}</p>
          )}

          <p className="mt-4 text-sm text-slate-500">
            You are logged in. This page cannot be reached without a valid
            token.
          </p>

          {/* Everything below comes from GET /auth/me, which means it travelled
              the full path: browser -> FastAPI -> SQLAlchemy -> PostgreSQL and
              back. Seeing your own created_at here is proof the whole chain
              works end to end. */}
          <dl className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">User id</dt>
              <dd className="font-medium text-slate-900">{user.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900">{user.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Joined</dt>
              <dd className="font-medium text-slate-900">
                {new Date(user.created_at).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          The feed arrives in Phase 7.
        </p>
      </main>
    </div>
  )
}

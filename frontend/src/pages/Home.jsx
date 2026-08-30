import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Header from '../components/Header'

// The page only logged-in people can see.
//
// Still deliberately almost empty. The real home page -- posts from the people
// you follow, newest first -- is Phase 7, and it cannot be built until follows
// (Phase 6) exist. What matters here is that this page is unreachable without
// a valid token, and that a refresh keeps you on it.
export default function Home() {
  // ProtectedRoute has already guaranteed user is not null by the time this
  // component draws, so there is no need to check again.
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50">
      {/* The top bar used to be written out here. It now lives in one shared
          component, because four pages need the same one. */}
      <Header />

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
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

          <div className="mt-6 flex gap-2">
            <Link
              to="/create"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Create a post
            </Link>
            <Link
              to={`/profile/${user.username}`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              View my profile
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          The feed arrives in Phase 7.
        </p>
      </main>
    </div>
  )
}

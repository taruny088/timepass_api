import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// The gate. Wrap any page in this and it becomes reachable only when logged in.
//
// A HONEST WARNING about what this does and does not do.
//
// This is a convenience for the user, not a security control. Everything here
// runs inside the browser, where anyone can open the developer tools and
// change it. It stops an ordinary visitor from landing on a page that would
// only show them errors -- that is all.
//
// The real protection is on the backend, where get_current_user refuses any
// request without a valid token. PLAN.md section 3 states the rule this
// follows: never trust the website. Hiding a page on screen is for looks; the
// backend check is the one that actually protects the data.
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  // Still checking the stored token with the backend. We genuinely do not know
  // yet whether this person is logged in, so we must not guess. Sending them
  // to /login here would flash the login page on every refresh.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading...</p>
      </div>
    )
  }

  // Now we know, and the answer is no.
  //
  // <Navigate> changes the address. replace means "swap the current history
  // entry" rather than adding a new one, so pressing Back does not land the
  // user on the protected page they were just bounced away from.
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Logged in. Draw whatever was wrapped.
  return children
}

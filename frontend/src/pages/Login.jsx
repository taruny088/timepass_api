import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Logo from '../components/Logo'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  // One piece of state per input box.
  //
  // These are CONTROLLED INPUTS: React holds the text, not the browser. The
  // box shows whatever is in state (value=), and every keystroke updates that
  // state (onChange=). It feels circular, and the payoff is that the current
  // text is always available in a normal variable.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Two more pieces of state for the states PLAN.md phase 9 asks every screen
  // to handle. Building them in now is far easier than retrofitting later.
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Already logged in, so there is nothing to do here. Sends you home rather
  // than showing a login form to someone who is logged in.
  if (user) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event) {
    // A form's normal behaviour is to reload the whole page. That would throw
    // away all our React state and defeat the point. preventDefault stops it,
    // and it is needed on every form you will ever write in React.
    event.preventDefault()

    setError('')
    setSubmitting(true)

    try {
      await login(email, password)
      // Worked. Move to the home page. replace means Back will not return to
      // the login form.
      navigate('/', { replace: true })
    } catch (err) {
      // userMessage was attached by the response interceptor in client.js, so
      // this page does not have to understand HTTP status codes. For a wrong
      // password it holds the backend's own "Incorrect email or password."
      setError(err.userMessage || 'Could not log in.')
    } finally {
      // finally runs whether it worked or failed. Without this, a failed
      // login would leave the button stuck saying "Logging in..." forever.
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        {/* The logo, then the name. This is the only kind of screen where the
            app shows both -- once you are inside, the symbol alone is enough,
            because you already know where you are. */}
        <div className="mb-4 flex flex-col items-center gap-2">
          <Logo className="h-12 w-12" />
          {/* font-display is Outfit, and this is one of only two places in the
              whole app it appears. One characterful typeface, used once, gives
              the app a voice. Used everywhere it would just be noise. */}
          <h1 className="font-display text-h1 font-semibold text-ink">
            Timepass
          </h1>
        </div>
        <p className="mb-6 text-center text-small text-ink-muted">
          Log in to see your feed
        </p>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-line bg-surface p-6"
        >
          {/* The error state. Rendered only when there is something to say:
              the && means "if error is non-empty, draw this". */}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-ink"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-line px-3 py-2 text-ink outline-none focus:border-ink"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-ink"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-line px-3 py-2 text-ink outline-none focus:border-ink"
              placeholder="••••••••"
            />
          </div>

          {/* disabled while submitting, so an impatient double click cannot
              send the same login twice. */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent py-2 font-medium text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-accent-soft"
          >
            {submitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-muted">
          No account?{' '}
          {/* <Link> instead of <a>. An <a> would reload the entire page and
              throw away all React state. Link swaps the component instead. */}
          <Link to="/signup" className="font-medium text-ink underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

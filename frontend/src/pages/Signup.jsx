import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Logo from '../components/Logo'

// Almost identical to Login, on purpose. This is the pattern PLAN.md predicted:
// once login works end to end, every later feature is a smaller version of the
// same loop -- form, state, request, error, redirect.
export default function Signup() {
  const { user, signup } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    // Checking on the website too, so the user gets an instant answer instead
    // of waiting for a round trip.
    //
    // This does NOT replace the backend's check. Anyone can bypass what runs
    // in a browser, so the backend validates the same rules again -- Pydantic
    // rejects a short password whatever the website did. Frontend validation
    // is for speed and friendliness; backend validation is for correctness.
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSubmitting(true)

    try {
      // signup() creates the account and then logs in automatically, so the
      // user does not have to type their details twice.
      await signup({ username, email, password, fullName })
      navigate('/', { replace: true })
    } catch (err) {
      // Covers the 409 "That username is already taken." and any 422 from
      // Pydantic, already turned into one readable line by client.js.
      setError(err.userMessage || 'Could not create the account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Same block as Login. The two auth screens are the only place the
            name is spelled out, so they should introduce the app identically.
            In 11b these become one shared piece rather than two copies. */}
        <div className="mb-4 flex flex-col items-center gap-2">
          <Logo className="h-12 w-12" />
          <h1 className="font-display text-h1 font-semibold text-ink">
            Timepass
          </h1>
        </div>
        <p className="mb-6 text-center text-small text-ink-muted">
          Create an account
        </p>

        <Card as="form" onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <p
              role="alert"
              className="rounded-control bg-danger-soft px-3 py-2 text-small text-danger"
            >
              {error}
            </p>
          )}

          <Input
            label="Username"
            hint="Letters, numbers and underscores only."
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={30}
            // The same rule the backend enforces with Pydantic.
            // Without it the form accepted "john smith", sent it, and the
            // server answered 422 -- correct, but the user is told late by
            // a machine instead of early by the form. The backend check
            // stays: anything in a browser can be bypassed.
            pattern="[A-Za-z0-9_]+"
            title="Letters, numbers and underscores only"
            autoComplete="username"
            placeholder="john_23"
          />

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />

          <Input
            label="Full name (optional)"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={100}
            autoComplete="name"
            placeholder="John Smith"
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />

          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Creating account...' : 'Sign up'}
          </Button>
        </Card>

        <p className="mt-4 text-center text-small text-ink-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-ink underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-bold text-slate-900">
          Insta Clone
        </h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Create an account
        </p>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Username
            </label>
            <input
              id="username"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900"
              placeholder="john_23"
            />
            <p className="mt-1 text-xs text-slate-500">
              Letters, numbers and underscores only.
            </p>
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-700"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="fullName"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Full name{' '}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={100}
              autoComplete="name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900"
              placeholder="John Smith"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900"
              placeholder="At least 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 py-2 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? 'Creating account...' : 'Sign up'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-slate-900 underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}

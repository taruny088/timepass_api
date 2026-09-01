import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import Logo from '../components/Logo'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'

// Choosing a new password, using the code from the emailed link.
//
// HOW THIS DIFFERS FROM VerifyEmail.jsx, WHICH LOOKS SIMILAR.
//
// That page spends its code the moment it opens, so it needs a ref to survive
// StrictMode running the effect twice. This page has no effect at all: it
// shows a form, and the code is only spent when somebody presses the button.
//
// That is the safer shape, and it is why this one needs no guard. A one-time
// code should ideally be spent by a deliberate action rather than by a page
// merely being opened -- opening happens to anyone whose mail scanner follows
// the link.
const MIN_PASSWORD = 8

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.')
      return
    }

    setSaving(true)

    try {
      await api.post('/auth/reset-password', {
        token,
        new_password: newPassword,
      })
      setDone(true)
    } catch (err) {
      // The commonest failure here is a dead link -- already used, or older
      // than an hour. The backend deliberately does not say which, because
      // either way the only thing to do is ask for a new one.
      setError(err.userMessage || 'Could not reset your password.')
    } finally {
      setSaving(false)
    }
  }

  // No code in the address at all. Said plainly rather than showing a form that
  // cannot possibly work.
  if (!token) {
    return (
      <Shell>
        <h1 className="mt-6 text-center text-h1 font-semibold text-ink">
          Link incomplete
        </h1>
        <p className="mt-2 text-center text-body text-ink-muted">
          That link is missing its code. Check you copied the whole thing from
          the email, or ask for a new one.
        </p>
        <p className="mt-6 text-center text-small">
          <Link
            to="/forgot-password"
            className="font-semibold text-accent underline"
          >
            Ask for a new link
          </Link>
        </p>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
        <h1 className="mt-6 text-center text-h1 font-semibold text-ink">
          Password reset
        </h1>
        <p role="status" className="mt-2 text-center text-body text-ink-muted">
          You can log in with your new password now.
        </p>
        {/* Not logged in automatically, deliberately. Resetting proves control
            of the inbox, and asking them to type the new password once more
            proves they know what they just set -- which catches a mis-typed
            password immediately rather than at the next login, when they would
            have no idea what went wrong. */}
        <Button
          fullWidth
          className="mt-6"
          onClick={() => navigate('/login', { replace: true })}
        >
          Log in
        </Button>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="mt-6 text-center text-h1 font-semibold text-ink">
        Choose a new password
      </h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-control bg-danger-soft px-3 py-2 text-small text-danger"
          >
            {error}
          </p>
        )}

        <Input
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          hint={`At least ${MIN_PASSWORD} characters.`}
          required
        />

        <Input
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <Button type="submit" fullWidth disabled={saving}>
          {saving ? 'Saving...' : 'Set new password'}
        </Button>
      </form>

      <p className="mt-6 text-center text-small text-ink-muted">
        <Link to="/login" className="font-semibold text-accent underline">
          Back to log in
        </Link>
      </p>
    </Shell>
  )
}

// The card and logo wrapper, written once because this page has three quite
// different states and all three sit in the same frame.
function Shell({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-6">
      <Card className="w-full max-w-sm p-6">
        <Logo className="mx-auto h-12 w-12" />
        {children}
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import Logo from '../components/Logo'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'

// "I have forgotten my password."
//
// PUBLIC, necessarily -- somebody who cannot log in is exactly who this is for.
//
// THE THING TO NOTICE ABOUT THIS SCREEN: after submitting, it says the same
// sentence whether or not that address has an account. That is not vagueness
// for its own sake. "No account with that email" would let anybody test
// addresses one at a time to find out who has an account here, which is called
// an enumeration attack -- it does not break in on its own, it builds the list
// that breaking in starts from.
//
// It feels unhelpful to write, and it is the correct behaviour. The backend
// enforces it; this page must not undo it by being cleverer.
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSending(true)

    try {
      const response = await api.post('/auth/forgot-password', { email })
      // The sentence comes from the backend rather than being written here, so
      // there is one copy of the wording that has to stay careful.
      setMessage(response.data.detail)
      setSent(true)
    } catch (err) {
      // A real failure -- the server is down, or the address was malformed.
      // NOT "that account does not exist", which this endpoint never says.
      setError(err.userMessage || 'Could not send the reset link.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-6">
      <Card className="w-full max-w-sm p-6">
        <Logo className="mx-auto h-12 w-12" />

        {sent ? (
          <>
            <h1 className="mt-6 text-center text-h1 font-semibold text-ink">
              Check your email
            </h1>
            <p role="status" className="mt-2 text-center text-body text-ink-muted">
              {message}
            </p>
            <p className="mt-4 text-center text-tiny text-ink-muted">
              The link works once and expires in an hour.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-center text-h1 font-semibold text-ink">
              Forgot password
            </h1>
            <p className="mt-2 text-center text-small text-ink-muted">
              Enter your email address and we will send you a link to choose a
              new password.
            </p>

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
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />

              <Button type="submit" fullWidth disabled={sending}>
                {sending ? 'Sending...' : 'Send reset link'}
              </Button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-small text-ink-muted">
          <Link to="/login" className="font-semibold text-accent underline">
            Back to log in
          </Link>
        </p>
      </Card>
    </div>
  )
}

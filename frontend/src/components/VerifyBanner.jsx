import { MailWarning } from 'lucide-react'
import { useState } from 'react'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'

// The strip that appears under the header until an email address is confirmed.
//
// WHAT THIS IS AND IS NOT.
//
// It is a reminder, and a button to get another link. It is NOT what stops an
// unconfirmed account posting. Anything running in a browser belongs to
// whoever is running the browser -- they can switch it off, edit it, or ignore
// it entirely and call the API directly. The real rule is get_verified_user in
// backend/app/deps.py, which runs on the server before the endpoint does.
//
// Worth being clear about, because the two look interchangeable from a page
// and are not remotely: hiding a button is decoration, refusing a request is
// security.
export default function VerifyBanner() {
  const { user } = useAuth()
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  // Nothing to say. Note this reads is_verified, which the backend works out
  // from email_verified_at and puts in /auth/me -- no date is done in
  // arithmetic here, and nothing is remembered between visits. Change the
  // database and this changes with it.
  if (!user || user.is_verified) return null

  async function handleResend() {
    setSending(true)
    setMessage('')

    try {
      const response = await api.post('/auth/resend-verification')
      // The backend writes the sentence, including which address it went to.
      // Repeating that text here would mean two copies to keep in step, and
      // the frontend does not know the email address the account uses.
      setMessage(response.data.detail)
    } catch (err) {
      setMessage(err.userMessage || 'Could not send the email. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    // role="status" makes a screen reader announce this when it appears,
    // politely -- it waits for a pause rather than cutting in, which is right
    // for something informational. role="alert" would interrupt, and this is
    // not urgent enough to deserve that.
    <div
      role="status"
      className="border-b border-line bg-hover px-4 py-2"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-2 gap-y-1">
        <MailWarning
          className="h-4 w-4 shrink-0 text-ink-muted"
          aria-hidden="true"
        />

        {/* flex-wrap plus min-w-0 rather than a fixed row. On a 375 pixel
            screen this sentence and the button do not fit side by side, and
            without wrapping the banner would push the whole page sideways --
            the exact fault 11b existed to remove. */}
        <p className="min-w-0 text-small text-ink">
          {message || 'Confirm your email address to post, comment and follow.'}
        </p>

        {/* Not the shared Button component, deliberately.
         *
         * Button has min-h-11 -- 44 pixels, the size a fingertip needs for
         * something you aim at. That is right for a real action and wrong
         * here: a 44 pixel control inside a notice strip makes the strip
         * taller than the header it sits under, on every single page.
         *
         * This is a link in a sentence, which is what Instagram does with the
         * same kind of notice. The whole strip is easy to hit; the words are
         * the target. */}
        <button
          onClick={handleResend}
          disabled={sending}
          className="rounded-control text-small font-semibold text-accent underline transition active:opacity-70 disabled:text-ink-muted disabled:no-underline"
        >
          {sending ? 'Sending...' : 'Resend email'}
        </button>
      </div>
    </div>
  )
}

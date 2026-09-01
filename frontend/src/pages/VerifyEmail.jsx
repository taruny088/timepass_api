import { CircleCheck, CircleX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import Logo from '../components/Logo'
import Card from '../components/ui/Card'
import Spinner from '../components/ui/Spinner'

// The page the confirmation link in the email opens.
//
// WHY THE LINK COMES HERE AND NOT STRAIGHT TO THE BACKEND.
//
// Two reasons, and the second is the one that actually bites.
//
//   A link to the API would show raw JSON in the browser, which looks broken
//   to anyone who clicks it.
//
//   Mail apps, antivirus tools and corporate mail scanners QUIETLY FETCH LINKS
//   to check them for malware, before any human sees the message. The code is
//   single-use, so if merely fetching the address were what spent it, the
//   scanner would burn it and the real person would arrive to find their
//   brand-new link already used. Sending them to a page which then makes the
//   request avoids that: a scanner fetches HTML, it does not run the app.
//
// This page is PUBLIC -- no login needed. The link is very often opened on a
// phone while the account was made on a laptop, and requiring a login would
// strand exactly the people it is for. It is safe because the code itself is
// the proof: it went to that address and nowhere else.
export default function VerifyEmail() {
  // Reads the ?token=... part of the address. The same idea as useParams,
  // which reads the /:username part -- this one reads what comes after the
  // question mark.
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const { user, refreshUser } = useAuth()

  const [status, setStatus] = useState('checking')
  const [message, setMessage] = useState('')

  // THIS REF IS NOT OPTIONAL, AND HERE IS THE BUG IT PREVENTS.
  //
  // StrictMode (see main.jsx) deliberately runs every effect TWICE in
  // development, to expose effects that are not safe to repeat. Almost always
  // that is harmless -- fetching a profile twice just fetches it twice.
  //
  // Here it is fatal. The code may be spent exactly once. The first run
  // confirms the address; the second sends the now-dead code back and gets
  // "that link is not valid any more" -- so a perfectly good link would show
  // a failure to every developer who ever tested it, and the cause is
  // completely invisible from the message.
  //
  // A ref is a box React keeps between redraws without redrawing when it
  // changes. Setting it before the request goes out means the second run sees
  // it already true and does nothing.
  //
  // Worth understanding rather than copying: this is what StrictMode is FOR.
  // It is not being awkward, it is pointing out that this effect has a real
  // side effect that must not happen twice -- which would also happen in
  // production if React ever re-ran it for its own reasons.
  const alreadyAsked = useRef(false)

  useEffect(() => {
    if (alreadyAsked.current) return
    alreadyAsked.current = true

    if (!token) {
      setStatus('failed')
      setMessage('That link is missing its code. Check you copied all of it.')
      return
    }

    async function confirm() {
      try {
        const response = await api.post('/auth/verify-email', { token })
        setMessage(response.data.detail)

        // The backend answers 200 for both "confirmed" and "that link is
        // dead", because neither is a server error and the person can only do
        // one thing about it either way. So the wording decides what is drawn.
        //
        // Reading the text like this is a little crude, and the honest reason
        // it is acceptable is that there are exactly two outcomes and one
        // place that writes them. If a third appears, this should become a
        // proper field in the reply rather than a longer string check.
        const confirmed = response.data.detail.includes('confirmed')
        setStatus(confirmed ? 'done' : 'failed')

        // If this person happens to be logged in on this device, their copy of
        // the user still says unverified, so the banner would stay up and the
        // three blocked actions would still look blocked. Asking the backend
        // again fixes both. Wrapped in its own try, because failing to refresh
        // must not turn a successful confirmation into an error on screen.
        if (confirmed && user) {
          try {
            await refreshUser()
          } catch {
            // Nothing to do. The next page load asks again anyway.
          }
        }
      } catch (err) {
        setStatus('failed')
        setMessage(err.userMessage || 'Could not confirm your email address.')
      }
    }

    confirm()
    // Deliberately empty. This must run once, on arrival, and never again --
    // the ref above enforces that even in development. Listing user or
    // refreshUser here would invite a re-run the moment either changed, and
    // a re-run means a dead code.
    //
    // The linter would rather this listed token, user and refreshUser, and it
    // is right in general and wrong here -- following its advice would make
    // the effect re-run and spend a second code. Silenced on purpose, with the
    // reason written above it rather than left for the next person to guess.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-6">
      <Card className="w-full max-w-sm p-6 text-center">
        <Logo className="mx-auto h-12 w-12" />

        {status === 'checking' && (
          <div className="mt-6">
            <Spinner label="Confirming your email address" />
          </div>
        )}

        {status !== 'checking' && (
          <>
            {status === 'done' ? (
              <CircleCheck
                className="mx-auto mt-6 h-10 w-10 text-accent"
                aria-hidden="true"
              />
            ) : (
              <CircleX
                className="mx-auto mt-6 h-10 w-10 text-danger"
                aria-hidden="true"
              />
            )}

            <h1 className="mt-4 text-h1 font-semibold text-ink">
              {status === 'done' ? 'All done' : 'That did not work'}
            </h1>

            <p className="mt-2 text-body text-ink-muted">{message}</p>

            {/* Where to go next depends on whether this browser is logged in.
                Someone who opened the link on their phone is usually not, and
                sending them to the feed would just bounce them to the login
                page -- so say so plainly instead. */}
            <Link
              to={user ? '/' : '/login'}
              className="mt-6 inline-block text-strong font-semibold text-accent underline"
            >
              {user ? 'Go to Timepass' : 'Log in'}
            </Link>
          </>
        )}
      </Card>
    </div>
  )
}

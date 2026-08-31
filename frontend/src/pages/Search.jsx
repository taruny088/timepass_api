import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import Header from '../components/Header'

// How long to wait after the last keystroke before asking the server.
// 300ms is long enough to skip the letters of a word being typed, and short
// enough that the results still feel immediate.
const DEBOUNCE_MS = 300

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Remembers what the results on screen are actually FOR. Without it, the
  // moment you start typing again the old results would still be showing
  // under a different search term, which reads as a wrong answer.
  const [searchedFor, setSearchedFor] = useState('')

  useEffect(() => {
    const term = query.trim()

    // Nothing typed. Clear the results and, importantly, send no request.
    if (!term) {
      setResults([])
      setSearchedFor('')
      setError('')
      return
    }

    setLoading(true)
    setError('')

    // THE DEBOUNCE.
    //
    // The naive version of "search as you type" sends a request on every
    // keystroke: typing "mallory" would fire seven, six of them for text you
    // have already moved past. They also come back in any order, so an
    // earlier one landing last can overwrite the newest results.
    //
    // Instead of asking immediately, we set a timer for 300ms. If another
    // key is pressed before it fires, the cleanup function below cancels it
    // and a fresh timer starts. So the request only happens once you have
    // actually stopped typing.
    //
    // This is not a new mechanism -- it is useEffect's cleanup function, the
    // same one already used in Profile.jsx to throw away stale replies. Only
    // the use is new.
    let cancelled = false

    const timer = setTimeout(() => {
      api
        .get('/search/users', { params: { q: term } })
        .then((response) => {
          if (cancelled) return
          setResults(response.data)
          setSearchedFor(term)
        })
        .catch((err) => {
          if (cancelled) return
          setError(err.userMessage || 'Search failed.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, DEBOUNCE_MS)

    // Runs before the effect runs again, and when leaving the page.
    //
    // clearTimeout is what actually cancels the pending request. cancelled
    // covers the other case: the request had already been sent when the next
    // keystroke arrived, so its reply must be ignored rather than drawn.
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="mb-4 text-2xl font-bold text-ink">Find people</h1>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={50}
          autoFocus
          placeholder="Search by username or name"
          className="w-full rounded-lg border border-line px-4 py-2 outline-none focus:border-ink"
        />

        <div className="mt-4">
          {/* Nothing typed yet: a prompt, so the empty space is explained. */}
          {!query.trim() && (
            <p className="text-center text-sm text-ink-muted">
              Type a name to search.
            </p>
          )}

          {loading && (
            <p className="text-center text-sm text-ink-muted">Searching...</p>
          )}

          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          {/* Nothing found. Repeating what was searched for makes it clear
              the search ran and genuinely found nothing, rather than looking
              like it silently failed. */}
          {!loading && !error && searchedFor && results.length === 0 && (
            <p className="text-center text-sm text-ink-muted">
              No one found for &ldquo;{searchedFor}&rdquo;.
            </p>
          )}

          {results.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {results.map((person) => (
                <li key={person.id}>
                  <Link
                    to={`/profile/${person.username}`}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-hover"
                  >
                    {person.avatar_url ? (
                      <img
                        src={person.avatar_url}
                        alt={person.username}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-avatar font-bold text-on-accent">
                        {person.username[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {person.username}
                      </p>
                      {person.full_name && (
                        <p className="truncate text-sm text-ink-muted">
                          {person.full_name}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}

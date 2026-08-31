import { SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import BottomNav from '../components/BottomNav'
import Header from '../components/Header'
import Avatar from '../components/ui/Avatar'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'

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

      <main className="mx-auto max-w-lg px-4 py-6 pb-24 md:pb-8">
        <h1 className="mb-4 text-h1 font-semibold text-ink">Find people</h1>

        <Input
          label="Search by username or name"
          hideLabel
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={50}
          autoFocus
          placeholder="Search by username or name"
        />

        <div className="mt-4">
          {/* Nothing typed yet: a prompt, so the empty space is explained. */}
          {!query.trim() && (
            <p className="text-center text-small text-ink-muted">
              Type a name to search.
            </p>
          )}

          {loading && <Spinner label="Searching" />}

          {error && (
            <p className="rounded-control bg-danger-soft px-3 py-2 text-small text-danger">
              {error}
            </p>
          )}

          {/* Nothing found. Repeating what was searched for makes it clear
              the search ran and genuinely found nothing, rather than looking
              like it silently failed. */}
          {!loading && !error && searchedFor && results.length === 0 && (
            <EmptyState
              icon={SearchX}
              title="No one found"
              message={`Nothing matched “${searchedFor}”. Try a different spelling, or part of a name.`}
            />
          )}

          {results.length > 0 && (
            <Card as="ul" className="divide-y divide-line overflow-hidden">
              {results.map((person) => (
                <li key={person.id}>
                  <Link
                    to={`/profile/${person.username}`}
                    className="flex items-center gap-3 px-4 py-3 transition active:bg-hover hover:bg-hover"
                  >
                    <Avatar
                      src={person.avatar_url}
                      username={person.username}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-strong font-semibold text-ink">
                        {person.username}
                      </p>
                      {person.full_name && (
                        <p className="truncate text-small text-ink-muted">
                          {person.full_name}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </Card>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  )
}

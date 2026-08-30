import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import Header from '../components/Header'
import PostCard from '../components/PostCard'

// How many posts one page holds. Must not exceed the backend's own cap of 50.
const PAGE_SIZE = 20

// The home feed: posts by the people you follow, newest first.
//
// PLAN.md calls this the product. Everything in Phases 2 to 6 existed so that
// this page could ask one question and get an answer.
export default function Home() {
  const { user } = useAuth()

  const [posts, setPosts] = useState([])

  // The three states every screen needs.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Paging state.
  //   hasMore      is it worth showing a "Load more" button at all?
  //   loadingMore  is a second page on its way right now?
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // The first page, fetched once when the page opens.
  useEffect(() => {
    let ignore = false

    api
      .get('/feed', { params: { limit: PAGE_SIZE, offset: 0 } })
      .then((response) => {
        if (ignore) return
        setPosts(response.data)
        // If a full page came back there may well be more. If fewer came
        // back, we have certainly reached the end.
        //
        // One harmless quirk: when the total is exactly 20 this says "more",
        // and clicking Load more returns an empty page and then hides the
        // button. One wasted request, no wrong behaviour.
        setHasMore(response.data.length === PAGE_SIZE)
      })
      .catch((err) => {
        if (!ignore) setError(err.userMessage || 'Could not load your feed.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [])

  async function loadMore() {
    setLoadingMore(true)
    setError('')

    try {
      // offset is how many we already have. "Skip the ones I have, give me
      // the next twenty."
      const response = await api.get('/feed', {
        params: { limit: PAGE_SIZE, offset: posts.length },
      })

      // Add to the list rather than replacing it. [...current, ...new] builds
      // a NEW array from the old one plus the new items -- React notices the
      // change because it is a different array, not a modified one.
      setPosts((current) => [...current, ...response.data])
      setHasMore(response.data.length === PAGE_SIZE)
    } catch (err) {
      setError(err.userMessage || 'Could not load more posts.')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="mx-auto max-w-lg px-4 py-8">
        {/* STATE 1: loading */}
        {loading && <p className="text-center text-slate-500">Loading feed...</p>}

        {/* STATE 2: it failed */}
        {!loading && error && posts.length === 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* STATE 3: it worked, but there is genuinely nothing to show.
            PLAN.md asks for exactly this: "shows a friendly message instead
            of a blank screen when I follow nobody yet." A blank page looks
            broken; this explains what to do next. */}
        {!loading && !error && posts.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <h2 className="text-lg font-semibold text-slate-900">
              Your feed is empty
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Your feed shows posts from people you follow. Find someone and
              follow them, and their posts will appear here.
            </p>
            <Link
              to={`/profile/${user.username}`}
              className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Go to my profile
            </Link>
          </div>
        )}

        {/* STATE 4: posts */}
        {posts.length > 0 && (
          <div className="space-y-6">
            {/* One PostCard per post. key tells React which card is which, so
                adding a page updates only the new ones instead of redrawing
                everything already on screen. */}
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}

        {/* An error that happened while loading MORE, with posts already on
            screen. Shown under them rather than replacing them. */}
        {error && posts.length > 0 && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">
            {error}
          </p>
        )}

        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="mt-6 w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        )}

        {/* Only say "you have reached the end" once there is actually
            something above it to have reached the end of. */}
        {!loading && !hasMore && posts.length > 0 && (
          <p className="mt-6 text-center text-sm text-slate-400">
            You are all caught up.
          </p>
        )}
      </main>
    </div>
  )
}

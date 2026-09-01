import { Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import BottomNav from '../components/BottomNav'
import Header from '../components/Header'
import PostCard from '../components/PostCard'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'

// How many posts one page holds. Must not exceed the backend's own cap of 50.
const PAGE_SIZE = 20

// The home feed: posts by the people you follow, newest first.
//
// PLAN.md calls this the product. Everything in Phases 2 to 6 existed so that
// this page could ask one question and get an answer.
export default function Home() {

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
    <div className="min-h-screen bg-surface">
      <Header />

      {/* pb-24 leaves room for BottomNav, which is `fixed` and therefore sits
          ON TOP of the page rather than pushing it down. Without this padding
          the last post hides permanently underneath the bar and no amount of
          scrolling reaches it. md:pb-8 takes it back once the bar is gone. */}
      {/* NO px-4 HERE ANY MORE. From Phase 11's side-by-side comparison:
          Instagram's feed on a phone runs EDGE TO EDGE, the photo touching both
          sides of the screen. Page padding here cost 32 of 375 pixels, and the
          card borders another 2 -- nine percent of the photo, on the one screen
          the whole app exists to show photos on.

          The padding moves onto the things that still want it, below. Only the
          posts go full width, and only on a phone: sm:px-4 puts it back as soon
          as there is width to spare.

          max-w-lg is 512px and Instagram's feed column is 470px, so this is
          slightly wide on a laptop. Left alone deliberately: it is a
          desktop-only difference, and PLAN2 makes the phone the normal case. */}
      <main className="mx-auto max-w-lg py-6 pb-24 sm:px-4 md:pb-8">
        {/* STATE 1: loading */}
        {loading && (
          <div className="px-4 sm:px-0">
            <Spinner label="Loading feed" />
          </div>
        )}

        {/* STATE 2: it failed */}
        {!loading && error && posts.length === 0 && (
          <div className="mx-4 rounded-card border border-danger-line bg-danger-soft p-6 text-center sm:mx-0">
            <p className="text-body text-danger">{error}</p>
          </div>
        )}

        {/* STATE 3: it worked, but there is genuinely nothing to show.
            PLAN.md asks for exactly this: "shows a friendly message instead
            of a blank screen when I follow nobody yet." A blank page looks
            broken; this explains what to do next. */}
        {!loading && !error && posts.length === 0 && (
          <EmptyState
            icon={Users}
            title="Your feed is empty"
            message="Your feed shows posts from people you follow. Find someone and follow them, and their posts will appear here."
          >
            {/* The words still come from here, not from EmptyState. That file
                owns the shape; this one owns the meaning. A shared empty state
                that wrote its own message would be a hardcoded placeholder. */}
            <Link to="/search">
              <Button variant="primary">Find people</Button>
            </Link>
          </EmptyState>
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
          <p className="mx-4 mt-4 rounded-control bg-danger-soft px-3 py-2 text-center text-small text-danger sm:mx-0">
            {error}
          </p>
        )}

        {hasMore && (
          <div className="px-4 sm:px-0">
            <Button
              variant="secondary"
              fullWidth
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-6"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </Button>
          </div>
        )}

        {/* Only say "you have reached the end" once there is actually
            something above it to have reached the end of. */}
        {!loading && !hasMore && posts.length > 0 && (
          <p className="mt-6 px-4 text-center text-small text-ink-muted sm:px-0">
            You are all caught up.
          </p>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

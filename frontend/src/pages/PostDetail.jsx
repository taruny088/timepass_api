import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import BottomNav from '../components/BottomNav'
import CommentList from '../components/CommentList'
import Header from '../components/Header'
import PostActions from '../components/PostActions'
import PostHeader from '../components/PostHeader'
import PostImage from '../components/PostImage'
import Card from '../components/ui/Card'
import Carousel from '../components/ui/Carousel'
import Spinner from '../components/ui/Spinner'
import timeAgo from '../lib/timeAgo'
import useLike from '../lib/useLike'

// One post on its own page, at /post/12.
//
// This is what makes a post shareable: it has a real address that can be
// bookmarked, sent to someone, and reopened later.
//
// WHY THIS NO LONGER JUST DRAWS A PostCard.
//
// It used to, and that was right while both pages stacked a post the same way.
// 11c-ii puts the photo BESIDE the header and comments on a laptop, which is a
// different arrangement, not a different style -- and PostCard cannot produce
// it without filling up with conditionals.
//
// So the shared bits were pulled out into PostHeader and PostActions, and each
// page arranges them as it needs. Nothing is written twice; only the layout
// differs, which is exactly the difference that ought to live in a page.
export default function PostDetail() {
  const { postId } = useParams()
  const { user: me } = useAuth()
  const navigate = useNavigate()

  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false

    setLoading(true)
    setError('')

    api
      .get(`/posts/${postId}`)
      .then((response) => {
        if (!ignore) setPost(response.data)
      })
      .catch((err) => {
        if (!ignore) setError(err.userMessage || 'Could not load this post.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [postId])

  // Keeps the post's comment_count in step when a comment is added or
  // removed, so the number does not go stale while you are looking at it.
  function handleCommentCountChange(delta) {
    setPost((current) => ({
      ...current,
      comment_count: current.comment_count + delta,
    }))
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this post? This cannot be undone.')) return

    try {
      await api.delete(`/posts/${id}`)
      navigate(`/profile/${me.username}`, { replace: true })
    } catch (err) {
      setError(err.userMessage || 'Could not delete that post.')
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <main className="mx-auto max-w-lg px-4 py-6 pb-24 md:pb-8">
        {loading && <Spinner label="Loading post" />}

        {!loading && error && (
          <div className="rounded-card border border-danger-line bg-danger-soft p-6 text-center">
            <p className="text-body text-danger">{error}</p>
            <Link to="/" className="mt-3 inline-block text-small underline">
              Go home
            </Link>
          </div>
        )}

        {!loading && !error && post && <PostBody post={post} onDelete={handleDelete} onCommentCountChange={handleCommentCountChange} />}
      </main>

      <BottomNav />
    </div>
  )
}

// The post itself. A separate component purely so it can call useLike --
// hooks may only be called from a component, and the page above returns early
// while loading, which would mean calling it conditionally. React forbids that:
// hooks must run in the same order on every render.
//
// Splitting it out is the standard answer, and it is a real rule rather than a
// style preference. Put useLike in the page above and React errors the moment
// the post finishes loading.
function PostBody({ post, onDelete, onCommentCountChange }) {
  // Called once here, and shared by the photo and the heart -- the same
  // lifting-state-up reason as PostCard. See lib/useLike.js.
  const { liked, count, failed, toggle, like } = useLike(post)

  return (
    <Card className="overflow-hidden">
      {/* MOBILE FIRST. The plain classes describe the phone: one column,
          everything stacked, exactly like the feed.

          md:grid-cols-2 is the whole desktop layout -- from 768px up the photo
          takes the left half and the header, actions and comments take the
          right. md:items-start stops the two columns stretching to match each
          other's height, which would leave a tall empty gap under whichever is
          shorter. */}
      <div className="md:grid md:grid-cols-2 md:items-start">
        {/* Double-tap to like works here too. onClick on the wrapper rather
            than the image, so the tap area is the whole square. */}
        <div className="relative" onDoubleClick={like}>
          {post.media.length > 1 ? (
            <Carousel media={post.media} alt={post.caption || 'post'}>
              {(item, position) => (
                <PostImage
                  src={item.url}
                  alt={
                    post.caption
                      ? `${post.caption} (photo ${position + 1})`
                      : `Photo ${position + 1}`
                  }
                />
              )}
            </Carousel>
          ) : (
            <PostImage src={post.media[0].url} alt={post.caption || 'post'} />
          )}
        </div>

        {/* md:border-l is the divider between the two columns, and it exists
            only when there ARE two columns. On a phone the sections simply
            follow each other down the page. */}
        <div className="flex flex-col md:h-full md:border-l md:border-line">
          <PostHeader post={post} onDelete={onDelete} />

          <div className="border-t border-line px-4 py-3">
            <PostActions
              liked={liked}
              count={count}
              failed={failed}
              onToggle={toggle}
              // No comments link: this IS the comments page. A link to the page
              // you are already on only makes someone feel they missed
              // something.
            />

            {post.caption && (
              // No "more" link here, unlike the feed. The feed collapses long
              // captions because twenty of them would bury the photos; this
              // page is about ONE post, so hiding its caption behind a click
              // would be withholding the thing you came for.
              <p className="mt-2 whitespace-pre-wrap break-words text-body text-ink">
                {post.caption}
              </p>
            )}

            <time
              dateTime={post.created_at}
              title={new Date(post.created_at).toLocaleString()}
              className="mt-2 block text-tiny text-ink-muted"
            >
              {timeAgo(post.created_at)}
            </time>
          </div>

          <CommentList post={post} onCountChange={onCommentCountChange} />
        </div>
      </div>
    </Card>
  )
}

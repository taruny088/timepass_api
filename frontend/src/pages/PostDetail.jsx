import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import Header from '../components/Header'

// One post on its own page, at /post/12.
//
// This is what makes a post shareable: it has a real address that can be
// bookmarked, sent to someone, and reopened later. PLAN.md section 4 gives
// this as the reason for using a router at all.
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

  // Whether to draw the delete button. Only affects what is drawn -- the
  // backend checks ownership again and answers 403 to anyone else.
  const isMine = me?.id === post?.author?.id

  async function handleDelete() {
    if (!window.confirm('Delete this post? This cannot be undone.')) return

    try {
      await api.delete(`/posts/${post.id}`)
      navigate(`/profile/${me.username}`, { replace: true })
    } catch (err) {
      setError(err.userMessage || 'Could not delete that post.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="mx-auto max-w-lg px-4 py-8">
        {loading && <p className="text-center text-slate-500">Loading...</p>}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-700">{error}</p>
            <Link to="/" className="mt-3 inline-block text-sm underline">
              Go home
            </Link>
          </div>
        )}

        {!loading && !error && post && (
          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {/* Who wrote it. The author travels inside the post itself, so
                no second request is needed to draw this. */}
            <div className="flex items-center justify-between px-4 py-3">
              <Link
                to={`/profile/${post.author.username}`}
                className="flex items-center gap-3"
              >
                {post.author.avatar_url ? (
                  <img
                    src={post.author.avatar_url}
                    alt={post.author.username}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-300 text-sm font-bold text-white">
                    {post.author.username[0].toUpperCase()}
                  </div>
                )}
                <span className="font-medium text-slate-900">
                  {post.author.username}
                </span>
              </Link>

              {isMine && (
                <button
                  onClick={handleDelete}
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  Delete
                </button>
              )}
            </div>

            <img
              src={post.image_url}
              alt={post.caption || 'post'}
              className="w-full object-cover"
            />

            <div className="px-4 py-3">
              {post.caption && (
                <p className="whitespace-pre-wrap text-slate-800">
                  {post.caption}
                </p>
              )}
              {/* Stored as UTC, shown in the reader's own local time --
                  the rule set in Phase 2. */}
              <p className="mt-2 text-xs text-slate-400">
                {new Date(post.created_at).toLocaleString()}
              </p>
            </div>
          </article>
        )}
      </main>
    </div>
  )
}

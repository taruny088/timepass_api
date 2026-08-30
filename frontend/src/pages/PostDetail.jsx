import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import Header from '../components/Header'
import PostCard from '../components/PostCard'

// One post on its own page, at /post/12.
//
// This is what makes a post shareable: it has a real address that can be
// bookmarked, sent to someone, and reopened later.
//
// The card itself used to be written out here. It now comes from PostCard,
// the same component the feed draws twenty of. One design, two places.
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

        {/* Passing onDelete is what makes the Delete button appear -- and it
            still only shows on your own posts, which PostCard decides. The
            feed does not pass it, so no delete buttons appear there. */}
        {!loading && !error && post && (
          <PostCard post={post} onDelete={handleDelete} />
        )}
      </main>
    </div>
  )
}

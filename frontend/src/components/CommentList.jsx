import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'

// The comments under one post, plus the box for writing a new one.
//
// Note this deliberately does NOT use the optimistic trick from LikeButton.
// A comment is text the user wrote and expects to see saved. Showing it and
// then snatching it away would be worse than a short wait -- and if the
// request failed, their words would be gone. A like can be re-tapped; a
// paragraph cannot be re-typed from a screen that erased it.
//
// Choosing per action, rather than applying one rule everywhere, is the real
// skill here.
export default function CommentList({ post, onCountChange }) {
  const { user: me } = useAuth()

  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let ignore = false

    api
      .get(`/posts/${post.id}/comments`)
      .then((response) => {
        if (!ignore) setComments(response.data)
      })
      .catch((err) => {
        if (!ignore) setError(err.userMessage || 'Could not load comments.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [post.id])

  async function handleSubmit(event) {
    event.preventDefault()

    // Same check the backend makes. Here for a quick answer, there for
    // correctness -- anything running in a browser can be bypassed.
    if (!body.trim()) return

    setSubmitting(true)
    setError('')

    try {
      const response = await api.post(`/posts/${post.id}/comments`, {
        body,
      })

      // Add the new comment to the end. Comments read oldest first, so the
      // newest belongs at the bottom, which is where the server would put it
      // too.
      setComments((current) => [...current, response.data])
      setBody('')
      onCountChange?.(1)
    } catch (err) {
      setError(err.userMessage || 'Could not post your comment.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(commentId) {
    if (!window.confirm('Delete this comment?')) return

    try {
      await api.delete(`/comments/${commentId}`)
      setComments((current) => current.filter((c) => c.id !== commentId))
      onCountChange?.(-1)
    } catch (err) {
      setError(err.userMessage || 'Could not delete that comment.')
    }
  }

  // Who may delete a given comment: whoever wrote it, or whoever owns the
  // post it sits under.
  //
  // Only decides what is DRAWN. The backend checks both conditions again and
  // answers 403 to anyone else, because a hidden button stops nobody.
  function canDelete(comment) {
    return me?.id === comment.author.id || me?.id === post.author.id
  }

  return (
    <section className="border-t border-line px-4 py-3">
      <h2 className="mb-2 text-sm font-semibold text-ink">
        {comments.length === 1 ? '1 comment' : `${comments.length} comments`}
      </h2>

      {loading && <p className="text-sm text-ink-muted">Loading comments...</p>}

      {error && (
        <p className="mb-2 rounded bg-danger-soft px-2 py-1 text-sm text-danger">
          {error}
        </p>
      )}

      {/* The empty state: a clear sentence, not a blank gap that looks
          like something failed to load. */}
      {!loading && comments.length === 0 && (
        <p className="text-sm text-ink-muted">
          No comments yet. Be the first.
        </p>
      )}

      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <li key={comment.id} className="group flex items-start gap-2">
              <div className="min-w-0 flex-1 text-sm">
                <Link
                  to={`/profile/${comment.author.username}`}
                  className="font-semibold text-ink hover:underline"
                >
                  {comment.author.username}
                </Link>{' '}
                <span className="whitespace-pre-wrap text-ink">
                  {comment.body}
                </span>
                <p className="text-xs text-ink-muted">
                  {new Date(comment.created_at).toLocaleString()}
                </p>
              </div>

              {canDelete(comment) && (
                <button
                  onClick={() => handleDelete(comment.id)}
                  className="shrink-0 text-xs font-medium text-danger opacity-0 transition group-hover:opacity-100"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2200}
          placeholder="Add a comment..."
          className="flex-1 rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          // Disabled while empty, so the button cannot be pressed for a
          // comment that would be rejected anyway.
          disabled={submitting || !body.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-accent-soft"
        >
          {submitting ? '...' : 'Post'}
        </button>
      </form>
    </section>
  )
}

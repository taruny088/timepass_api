import { Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Avatar from './ui/Avatar'

// The row at the top of a post: who made it, and a delete button if it is
// yours.
//
// WHY THIS IS ITS OWN FILE NOW. Until 11c-ii it lived inside PostCard, which
// was right while PostCard was the only thing that drew a post. The single-post
// page now needs the same row in a different arrangement -- beside the photo on
// a laptop rather than above it -- so PostCard cannot simply be reused whole.
//
// The alternatives were to copy this markup into PostDetail, where it would
// quietly drift out of step, or to fill PostCard with conditionals until it
// became the hardest file in the app to read. Pulling the shared piece out is
// the same reasoning that produced the ui/ folder in 11b.
export default function PostHeader({ post, onDelete }) {
  const { user: me } = useAuth()

  // Only affects what is DRAWN. The backend checks ownership again on every
  // delete request and answers 403 to anyone else, because a hidden button
  // stops nobody.
  const isMine = me?.id === post.author.id

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3">
      <Link
        to={`/profile/${post.author.username}`}
        className="flex min-w-0 items-center gap-3"
      >
        <Avatar
          src={post.author.avatar_url}
          username={post.author.username}
          size="sm"
        />
        <span className="truncate text-strong font-semibold text-ink hover:underline">
          {post.author.username}
        </span>
      </Link>

      {/* Drawn only when the parent passed onDelete AND the post is mine. The
          feed passes nothing, so no delete buttons appear there. */}
      {isMine && onDelete && (
        <button
          onClick={() => onDelete(post.id)}
          aria-label="Delete post"
          title="Delete post"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-ink-muted transition active:scale-90 hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

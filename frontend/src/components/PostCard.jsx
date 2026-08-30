import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import LikeButton from './LikeButton'
import PostImage from './PostImage'

// One post, drawn once, used everywhere.
//
// This is the exact thing PLAN.md section 4 gives as the reason for choosing
// React:
//
//   "Instagram's feed is the same post card repeated many times with
//    different data. React is built exactly for that: make one card design,
//    feed it different data."
//
// The feed draws twenty of these with twenty different posts. The post detail
// page draws one. Neither knows how the other works, and a change to the card
// design lands in both at once.
//
// PROPS are the values a component is given by whoever draws it. Here:
//   post              the post to draw
//   onDelete          optional. If given, a Delete button appears on your
//                     own posts, called with the post id when clicked.
//   showCommentsLink  optional. The feed shows a "View all 3 comments" link;
//                     the post page draws the real comments instead, so it
//                     turns this off.
export default function PostCard({
  post,
  onDelete,
  showCommentsLink = true,
}) {
  const { user: me } = useAuth()

  // Only affects what is drawn. The backend checks ownership again on every
  // delete request and answers 403 to anyone else, because a hidden button
  // stops nobody.
  const isMine = me?.id === post.author.id

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
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
          <span className="font-medium text-slate-900 hover:underline">
            {post.author.username}
          </span>
        </Link>

        {/* Drawn only when the parent passed onDelete AND the post is mine. */}
        {isMine && onDelete && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-sm font-medium text-red-600 hover:underline"
          >
            Delete
          </button>
        )}
      </div>

      <Link to={`/post/${post.id}`}>
        <PostImage
          src={post.image_url}
          alt={post.caption || 'post'}
          className="min-h-48 w-full bg-slate-100 object-cover"
        />
      </Link>

      <div className="px-4 py-3">
        {/* The heart owns its own state, because it changes before the
            server replies. See LikeButton for why. */}
        <LikeButton post={post} />

        {post.caption && (
          <p className="mt-2 whitespace-pre-wrap text-slate-800">
            {post.caption}
          </p>
        )}

        {/* A link rather than the comments themselves. The feed shows only
            the count, so scrolling it never fetches comment data; the full
            thread lives on the post's own page. */}
        {showCommentsLink && (
          <Link
            to={`/post/${post.id}`}
            className="mt-1 block text-sm text-slate-500 hover:underline"
          >
            {post.comment_count === 0
              ? 'Add a comment'
              : post.comment_count === 1
                ? 'View 1 comment'
                : `View all ${post.comment_count} comments`}
          </Link>
        )}
        {/* Stored as UTC, shown in the reader's own local time -- the rule
            set back in Phase 2 when created_at was given a timezone. */}
        <p className="mt-2 text-xs text-slate-400">
          {new Date(post.created_at).toLocaleString()}
        </p>
      </div>
    </article>
  )
}

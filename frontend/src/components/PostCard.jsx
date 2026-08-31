import { MessageCircle, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import LikeButton from './LikeButton'
import PostImage from './PostImage'
import Avatar from './ui/Avatar'
import Card from './ui/Card'

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
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <Link
          to={`/profile/${post.author.username}`}
          // min-w-0 so a long username wraps instead of pushing the delete
          // button off the edge of a phone screen.
          className="flex min-w-0 items-center gap-3"
        >
          {/* Three copies of the picture-or-first-letter block used to live in
              this app. Now there is one, and it already handles the shrink-0
              that stops a round photo squashing into an oval next to long
              text. */}
          <Avatar
            src={post.author.avatar_url}
            username={post.author.username}
            size="sm"
          />
          <span className="truncate text-strong font-semibold text-ink hover:underline">
            {post.author.username}
          </span>
        </Link>

        {/* Drawn only when the parent passed onDelete AND the post is mine. */}
        {isMine && onDelete && (
          <button
            onClick={() => onDelete(post.id)}
            aria-label="Delete post"
            title="Delete post"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-ink-muted transition hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <Link to={`/post/${post.id}`}>
        <PostImage
          src={post.image_url}
          alt={post.caption || 'post'}
          className="min-h-48 w-full bg-hover object-cover"
        />
      </Link>

      <div className="px-4 py-3">
        {/* The action row: heart, then comment. Icons rather than words, which
            is what PLAN2 asks for under a post -- and what makes the row read
            at a glance instead of being read word by word. */}
        <div className="flex items-center gap-4">
          {/* The heart owns its own state, because it changes before the
              server replies. See LikeButton for why. */}
          <LikeButton post={post} />

          {showCommentsLink && (
            <Link
              to={`/post/${post.id}`}
              aria-label="Comments"
              title="Comments"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink transition hover:bg-hover"
            >
              <MessageCircle className="h-6 w-6" aria-hidden="true" />
            </Link>
          )}
        </div>

        {/* whitespace-pre-wrap keeps the line breaks someone typed. It does not
            help with a single long unbroken run of characters, though -- a
            pasted URL has nowhere to wrap, so it runs straight off the edge and
            drags the page with it.

            break-words allows a break inside a word when there is no other
            option. Only then: ordinary sentences still break at spaces as
            normal, so nothing else changes. */}
        {post.caption && (
          <p className="mt-2 whitespace-pre-wrap break-words text-body text-ink">
            {post.caption}
          </p>
        )}

        {/* A link rather than the comments themselves. The feed shows only
            the count, so scrolling it never fetches comment data; the full
            thread lives on the post's own page. */}
        {showCommentsLink && (
          <Link
            to={`/post/${post.id}`}
            className="mt-2 block text-small text-ink-muted hover:underline"
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
        <p className="mt-2 text-tiny text-ink-muted">
          {new Date(post.created_at).toLocaleString()}
        </p>
      </div>
    </Card>
  )
}

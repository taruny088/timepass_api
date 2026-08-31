import { MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import LikeButton from './LikeButton'

// The row under a photo: the heart with its count, and the comment icon.
//
// Pulled out of PostCard alongside PostHeader, for the same reason -- the
// single-post page needs this row too, in a different place on the page.
//
// Note what it does NOT do: it holds no state. The like state lives in
// useLike, called once by whichever page is drawing the post, and arrives here
// as plain values. That is deliberate and it is the lesson from 11c-i -- the
// photo and this heart must agree, so neither of them may own the answer.
export default function PostActions({
  liked,
  count,
  failed,
  onToggle,
  // The address of the post's own page, or nothing. The feed passes one; the
  // post page passes none, because a link to the page you are already on is
  // just a way to make someone feel they have missed something.
  commentsHref,
}) {
  return (
    <div className="flex items-center gap-4">
      <LikeButton
        liked={liked}
        count={count}
        failed={failed}
        onToggle={onToggle}
      />

      {commentsHref && (
        <Link
          to={commentsHref}
          aria-label="Comments"
          title="Comments"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink transition active:scale-90 hover:bg-hover"
        >
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}

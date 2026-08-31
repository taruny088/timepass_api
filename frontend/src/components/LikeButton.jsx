import { Heart } from 'lucide-react'

// The heart, and the like count beside it.
//
// WHAT CHANGED IN 11c. This used to hold the like state itself. It no longer
// does -- the state moved to lib/useLike.js, and PostCard calls that once and
// passes the result down here.
//
// The reason is that 11c adds a SECOND way to like a post: double-tapping the
// photo. The photo is this component's sibling. If both of them kept their own
// state they would disagree the moment either was used, and the bug would look
// baffling -- a big heart animating over the picture while the little one
// underneath stays empty.
//
// So this file went from owning a decision to drawing one. That is usually the
// right direction of travel: a component that only draws is far easier to
// reason about than one that also decides.
//
// The optimistic-update explanation that used to live here is now in
// lib/useLike.js, next to the code it describes.
export default function LikeButton({ liked, count, failed, onToggle }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggle}
        aria-label={liked ? 'Unlike' : 'Like'}
        // aria-pressed is what makes this a TOGGLE to a screen reader rather
        // than a plain button. It announces "Like, pressed" or "Like, not
        // pressed", so the current state is audible instead of only visible in
        // the colour of the heart.
        aria-pressed={liked}
        // Deliberately NOT disabled while the request is in flight. Being able
        // to tap again immediately is the point. Two rapid taps send two
        // requests, and the backend is idempotent precisely so that cannot
        // break anything.
        className="flex min-h-11 min-w-11 items-center justify-center rounded-control transition hover:bg-hover active:scale-90"
      >
        <Heart
          className={`h-6 w-6 transition ${liked ? 'text-heart' : 'text-ink'}`}
          fill={liked ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      </button>

      <span className="text-strong font-semibold text-ink">
        {count} {count === 1 ? 'like' : 'likes'}
      </span>

      {failed && <span className="text-tiny text-danger">could not save</span>}
    </div>
  )
}

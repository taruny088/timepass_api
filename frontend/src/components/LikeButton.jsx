import { useState } from 'react'
import api from '../api/client'

// The heart.
//
// THIS IS THE NEW IDEA IN PHASE 8, and it is worth reading slowly.
//
// Every other button in this app waits for the server. The Follow button in
// Phase 6 sends its request, waits for a reply, and only then changes what it
// says. That is honest: the screen never shows anything unconfirmed.
//
// This button does the opposite. It changes IMMEDIATELY, before the server
// has answered, and quietly puts itself back if the request turns out to
// have failed. That is called an OPTIMISTIC UPDATE: the screen assumes the
// request will succeed, because it almost always does.
//
// PLAN.md states the trade-off exactly:
//
//   "for a fraction of a second the screen is showing something that might
//    not be true -- which is acceptable for a like, and would not be
//    acceptable for a payment."
//
// That sentence is the whole lesson. Optimistic updates are not simply
// better. They are a BET that the request will work. When the bet is wrong,
// you have shown the user something false. Fine for a heart. Never for money,
// a booking, or anything the user would act on.
export default function LikeButton({ post }) {
  // This button owns the answer, starting from what the server said when the
  // post was loaded. It has to own it, because it changes the answer before
  // the server has agreed.
  const [liked, setLiked] = useState(post.is_liked)
  const [count, setCount] = useState(post.like_count)
  const [failed, setFailed] = useState(false)

  async function handleClick() {
    // Remember the truth before we change anything, so we can put it back if
    // the request fails. Without this we would have nothing to revert TO.
    const wasLiked = liked
    const wasCount = count

    // 1. CHANGE THE SCREEN FIRST. No waiting. This is the whole point -- the
    //    heart fills the instant it is tapped, with no visible delay.
    setLiked(!wasLiked)
    setCount(wasLiked ? wasCount - 1 : wasCount + 1)
    setFailed(false)

    // 2. Then tell the server, and hope.
    try {
      if (wasLiked) {
        await api.delete(`/posts/${post.id}/like`)
      } else {
        await api.post(`/posts/${post.id}/like`)
      }
    } catch {
      // 3. The bet was wrong. Put the screen back to what is actually true.
      //
      //    This is the branch that makes optimistic updates honest rather
      //    than merely fast. Without it, a failed request would leave a
      //    filled heart for a like that was never saved -- and the user
      //    would only find out on their next refresh.
      setLiked(wasLiked)
      setCount(wasCount)
      setFailed(true)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        aria-label={liked ? 'Unlike' : 'Like'}
        aria-pressed={liked}
        // Deliberately NOT disabled while the request is in flight. Being
        // able to tap again immediately is the point. Two rapid taps send
        // two requests, and the backend is idempotent precisely so that
        // cannot break anything.
        className="text-2xl leading-none transition hover:scale-110"
      >
        {liked ? '❤️' : '🤍'}
      </button>

      <span className="text-sm font-medium text-ink">
        {count} {count === 1 ? 'like' : 'likes'}
      </span>

      {failed && (
        <span className="text-xs text-danger">could not save</span>
      )}
    </div>
  )
}

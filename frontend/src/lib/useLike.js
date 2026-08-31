import { useState } from 'react'
import api from '../api/client'

// The like state for one post: whether it is liked, how many likes it has, and
// how to change that.
//
// WHY THIS WAS PULLED OUT OF LikeButton.
//
// Until now LikeButton owned the answer. That was fine while the heart was the
// only way to like something. 11c adds a second way -- double-tapping the photo
// -- and the photo is LikeButton's SIBLING, not its child.
//
// The trap to understand, because it is the classic React mistake: if the photo
// and the button each called useLike() themselves, they would each get their
// OWN separate state. Two hearts, two counts, no connection. Double-tap the
// photo and the big heart animates while the little one underneath stays empty,
// because they are not the same piece of information -- they are two copies
// that happen to have started equal.
//
// A hook is a way to reuse LOGIC. It is not a way to share a VALUE. To share a
// value, the state has to live somewhere both parties can see -- their nearest
// shared parent. That is called LIFTING STATE UP, and it is why PostCard calls
// this once and hands the result down to both.
export default function useLike(post) {
  // Starting from what the server said when the post was loaded. This owns the
  // answer from then on, because it changes the answer before the server has
  // agreed.
  const [liked, setLiked] = useState(post.is_liked)
  const [count, setCount] = useState(post.like_count)
  const [failed, setFailed] = useState(false)

  // The OPTIMISTIC UPDATE, unchanged from Phase 8 -- only moved.
  //
  //   "for a fraction of a second the screen is showing something that might
  //    not be true -- which is acceptable for a like, and would not be
  //    acceptable for a payment."
  //
  // The screen changes first and puts itself back if the request fails.
  async function setLiked_(shouldBeLiked) {
    // Nothing to do. This is what makes double-tapping an already-liked photo
    // a no-op instead of a pointless request.
    if (shouldBeLiked === liked) return

    const wasLiked = liked
    const wasCount = count

    // 1. CHANGE THE SCREEN FIRST. No waiting.
    setLiked(shouldBeLiked)
    setCount(shouldBeLiked ? wasCount + 1 : wasCount - 1)
    setFailed(false)

    // 2. Then tell the server, and hope.
    try {
      if (shouldBeLiked) {
        await api.post(`/posts/${post.id}/like`)
      } else {
        await api.delete(`/posts/${post.id}/like`)
      }
    } catch {
      // 3. The bet was wrong. Put the screen back to what is actually true.
      //
      // This branch is what makes an optimistic update honest rather than
      // merely fast. Without it a failed request leaves a filled heart for a
      // like that was never saved.
      setLiked(wasLiked)
      setCount(wasCount)
      setFailed(true)
    }
  }

  return {
    liked,
    count,
    failed,

    // For the heart button: like if unliked, unlike if liked.
    toggle: () => setLiked_(!liked),

    // For double-tapping the photo: only ever LIKES, never unlikes.
    //
    // This is deliberate and it is what Instagram does. A double tap is easy to
    // trigger by accident while scrolling, and an accidental tap that adds a
    // like is harmless -- an accidental tap that silently REMOVES one you meant
    // to give is not, because nothing on screen tells you it happened.
    //
    // Taking a like away should require aiming at the heart.
    like: () => setLiked_(true),
  }
}

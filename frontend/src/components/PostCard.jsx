import { Heart } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import timeAgo from '../lib/timeAgo'
import useLike from '../lib/useLike'
import PostActions from './PostActions'
import PostHeader from './PostHeader'
import PostImage from './PostImage'
import Card from './ui/Card'
import Carousel from './ui/Carousel'

// How long a caption can be before it is cut off behind a "more" link.
// 125 characters is Instagram's own threshold.
const CAPTION_LIMIT = 125

// The longest gap between two taps that still counts as a double tap.
// 300ms is the usual figure. Longer and ordinary separate taps start being
// treated as one gesture; shorter and a real double tap gets missed.
const DOUBLE_TAP_MS = 300

// One post, drawn once, used everywhere.
//
// PROPS:
//   post              the post to draw
//   onDelete          optional. If given, a delete button appears on your own
//                     posts, called with the post id.
//   showCommentsLink  optional. The feed shows a "View all 3 comments" link;
//                     the post page draws the real comments instead.
export default function PostCard({
  post,
  onDelete,
  showCommentsLink = true,
}) {
  // LIFTING STATE UP.
  //
  // Called HERE, once, and handed to both the photo and the heart below. It
  // cannot be called in each of them separately: a hook shares logic, not a
  // value, so two calls would produce two independent states. The photo would
  // like the post and the heart underneath would never hear about it.
  //
  // PostCard is the nearest parent both of them have, which is exactly why the
  // state belongs here.
  const { liked, count, failed, toggle, like } = useLike(post)

  const [expanded, setExpanded] = useState(false)
  const [burst, setBurst] = useState(false)

  // ---------------------------------------------------------------------
  // DOUBLE TAP
  //
  // The browser gives you a "dblclick" event for a mouse and nothing reliable
  // for a finger, so a double TAP has to be worked out by hand: remember when
  // the last tap happened, and if the next one lands soon enough, treat the
  // pair as a gesture.
  //
  // useRef rather than useState is the important choice. Changing state tells
  // React to redraw, and this value changes on every single tap -- redrawing
  // the card each time would be pure waste, and worse, the redraw could land
  // before the second tap and lose the value we are trying to keep. A ref is a
  // box that survives redraws and does not cause them.
  // ---------------------------------------------------------------------
  const lastTapAt = useRef(0)

  // A timer id, kept so it can be cancelled if the card disappears mid-burst.
  const burstTimer = useRef(null)

  useEffect(() => {
    // Cleanup, run when this card is removed from the screen -- scrolled out of
    // a list that re-renders, or a post deleted while its heart is animating.
    //
    // Without this the timer would still fire afterwards and call setBurst on a
    // component that no longer exists. React warns about it, and it is a real
    // (small) leak.
    return () => clearTimeout(burstTimer.current)
  }, [])

  // WHERE A TAP STARTED, so a swipe is not mistaken for one.
  //
  // On a carousel this matters. Dragging sideways to the next photo ends with a
  // finger lifting off the picture, and treated naively that is a tap -- so
  // swiping through five photos would like the post twice on the way.
  //
  // The distinction is movement: a tap lands where it started, a swipe does not.
  // 10 pixels of slack because nobody holds a phone perfectly still.
  const pointerStart = useRef({ x: 0, y: 0 })

  function handlePointerDown(event) {
    pointerStart.current = { x: event.clientX, y: event.clientY }
  }

  function handlePointerUp(event) {
    const movedX = Math.abs(event.clientX - pointerStart.current.x)
    const movedY = Math.abs(event.clientY - pointerStart.current.y)

    // Moved too far to be a tap. It was a swipe or a scroll, so do nothing --
    // and deliberately do not record it as the first half of a double tap
    // either, or a swipe followed by a real tap would count as one.
    if (movedX > 10 || movedY > 10) return

    handlePhotoTap()
  }

  function handlePhotoTap() {
    const now = Date.now()

    if (now - lastTapAt.current < DOUBLE_TAP_MS) {
      // Second tap, soon enough. This is a double tap.
      like()

      setBurst(true)
      clearTimeout(burstTimer.current)
      // Matches the 700ms animation in index.css. Removing the heart after it
      // has faded keeps it out of the way of the next tap.
      burstTimer.current = setTimeout(() => setBurst(false), 700)

      // Reset, so a third tap starts a fresh pair rather than counting as
      // another double with the second.
      lastTapAt.current = 0
    } else {
      lastTapAt.current = now
    }
  }

  // ---------------------------------------------------------------------
  // CAPTION
  // ---------------------------------------------------------------------
  const caption = post.caption || ''
  const isLongCaption = caption.length > CAPTION_LIMIT
  const shownCaption =
    expanded || !isLongCaption
      ? caption
      : // trimEnd so the ellipsis does not float after a stray space.
        `${caption.slice(0, CAPTION_LIMIT).trimEnd()}… `

  return (
    <Card as="article" className="overflow-hidden">
      <PostHeader post={post} onDelete={onDelete} />

      {/* THE PHOTO IS NOT A LINK, and that is deliberate.
       *
       * It cannot be, and coexist with a double tap: the first tap would
       * navigate away before the second one ever happened. Instagram's feed
       * photo is not a link either, for the same reason. The comment icon, the
       * comments line and the timestamp all still reach the post page.
       *
       * onPointerDown/onPointerUp rather than onClick, so a swipe across a
       * carousel is not read as a tap. Pointer events cover mouse, finger and
       * stylus with one pair of handlers. */}
      <div
        className="relative"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/* One photo draws plainly; several get the carousel. No carousel for a
            single photo -- it would add dots and a "1/1" counter that say
            nothing, and a scroll container with nothing to scroll. */}
        {post.media.length > 1 ? (
          <Carousel media={post.media} alt={post.caption || 'post'}>
            {(item, position) => (
              <PostImage
                src={item.url}
                alt={
                  post.caption
                    ? `${post.caption} (photo ${position + 1})`
                    : `Photo ${position + 1}`
                }
              />
            )}
          </Carousel>
        ) : (
          <PostImage src={post.media[0].url} alt={post.caption || 'post'} />
        )}

        {/* The burst. pointer-events-none is essential: without it this heart
            sits over the photo and swallows the next tap, so double-tapping
            twice in a row would not work -- and it would block the swipe. */}
        {burst && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Heart
              className="h-24 w-24 animate-heart-burst text-on-accent drop-shadow-lg"
              fill="currentColor"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        <PostActions
          liked={liked}
          count={count}
          failed={failed}
          onToggle={toggle}
          commentsHref={showCommentsLink ? `/post/${post.id}` : undefined}
        />

        {caption && (
          <p className="mt-2 whitespace-pre-wrap break-words text-body text-ink">
            {shownCaption}
            {/* Only offered when there is genuinely something hidden. A "more"
                link that expands to the same text is worse than none. */}
            {isLongCaption && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="text-ink-muted hover:underline"
              >
                more
              </button>
            )}
          </p>
        )}

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

        {/* <time> is the correct element for a date. It shows "2h ago", and
            carries the exact timestamp in dateTime -- so a screen reader or a
            search engine gets the real value rather than a vague phrase that
            was only true when the page was drawn.

            title puts the full date in a tooltip, so the precise moment is
            still one hover away when someone wants it. */}
        <time
          dateTime={post.created_at}
          title={new Date(post.created_at).toLocaleString()}
          className="mt-2 block text-tiny text-ink-muted"
        >
          {timeAgo(post.created_at)}
        </time>
      </div>
    </Card>
  )
}

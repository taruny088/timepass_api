import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'

// Several photos, swiped left and right, with dots underneath.
//
// NO SWIPE-DETECTION CODE, AND THAT IS THE POINT.
//
// The obvious way to build this is to listen for touchstart and touchend, work
// out the distance and direction, and animate accordingly. That is the common
// mistake. Done by hand you have to reinvent momentum, rubber-banding at the
// ends, mouse dragging, trackpad gestures and keyboard support -- and the
// result still feels subtly wrong on a real phone.
//
// The browser already does all of that for a sideways-scrolling element. CSS
// SCROLL-SNAP then adds the one missing piece: snap-x snap-mandatory tells it
// never to come to rest between photos, so it glides to the nearest one.
//
// Everything below is layout and a scroll listener to work out which dot to
// light. There is no gesture code at all.
export default function Carousel({ media, alt, children }) {
  const trackRef = useRef(null)
  const [index, setIndex] = useState(0)

  // WHICH PHOTO ARE WE ON.
  //
  // Rather than tracking gestures, ask the element how far it has been
  // scrolled and divide by its width. Round, rather than floor: half way
  // between two photos should already be reporting the one being moved towards,
  // otherwise the dot changes late and feels laggy.
  function handleScroll(event) {
    const track = event.currentTarget
    const current = Math.round(track.scrollLeft / track.clientWidth)

    // Only set state when it actually changes. A scroll fires this dozens of
    // times a second, and calling setState with the value it already holds on
    // every one of them would redraw the card constantly for nothing.
    if (current !== index) setIndex(current)
  }

  function goTo(target) {
    const track = trackRef.current
    if (!track) return

    // Scroll the track and let snap settle it. behavior:'smooth' animates,
    // and the reduced-motion rule in index.css turns that off for anyone who
    // has asked for less movement.
    track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      {/* THE TRACK.
       *
       *  flex              lay the photos in a row
       *  overflow-x-auto   let that row scroll sideways
       *  snap-x            snapping happens on the horizontal axis
       *  snap-mandatory    it MUST come to rest on a photo, never between two
       *
       * scrollbar-none hides the bar. Normally hiding a scrollbar is a bad idea
       * because it removes the only clue that something scrolls -- here the dots
       * underneath do that job, and a grey bar across the bottom of a photo
       * looks like a mistake. */}
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {media.map((item, position) => (
          <div
            key={item.url}
            // shrink-0 and w-full together are what make each photo exactly one
            // screenful. Without shrink-0 the flex row squeezes all of them in
            // side by side and there is nothing to scroll.
            className="w-full shrink-0 snap-center"
          >
            {/* children is a FUNCTION here rather than elements.
             *
             * The carousel knows how to arrange photos and nothing about how to
             * draw one -- PostImage handles loading, broken links and reserving
             * space. Passing a function lets the caller decide the drawing while
             * this file decides the arrangement.
             *
             * The alternative, importing PostImage here, would tie the carousel
             * to one kind of content forever. */}
            {children(item, position)}
          </div>
        ))}
      </div>

      {/* Arrows, on pointer devices only.
       *
       * hidden by default and shown from md: up, because on a phone you swipe --
       * an arrow button would just cover part of the photo with something nobody
       * needs. This is mobile first working properly: the phone gets the plain
       * rule and the desktop gets the addition. */}
      {index > 0 && (
        <button
          onClick={() => goTo(index - 1)}
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-surface/80 p-1 text-ink transition hover:bg-surface md:flex"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {index < media.length - 1 && (
        <button
          onClick={() => goTo(index + 1)}
          aria-label="Next photo"
          className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-surface/80 p-1 text-ink transition hover:bg-surface md:flex"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {/* The counter, top right, exactly as Instagram does it. */}
      <div className="absolute right-2 top-2 rounded-full bg-scrim px-2 py-0.5 text-tiny font-semibold text-on-scrim">
        {index + 1}/{media.length}
      </div>

      {/* The dots.
       *
       * NOT BUTTONS, on purpose. A dot is 6 pixels across -- far below the 44
       * pixels a fingertip can reliably hit -- so making them tappable would be
       * offering a control that does not work. They are a position indicator,
       * and swiping is how you move.
       *
       * aria-hidden for the same reason: they say nothing a screen reader user
       * can act on. The counter above already gives the position in words. */}
      <div
        className="flex items-center justify-center gap-1 py-2"
        aria-hidden="true"
      >
        {media.map((item, position) => (
          <span
            key={item.url}
            className={`h-1.5 w-1.5 rounded-full transition ${
              position === index ? 'bg-accent' : 'bg-line'
            }`}
          />
        ))}
      </div>

      {/* The screen-reader version of the same information, announced when it
          changes. aria-live="polite" means "tell me at the next natural pause",
          rather than interrupting whatever is being read. */}
      <span className="sr-only" aria-live="polite">
        {`Photo ${index + 1} of ${media.length}${alt ? `: ${alt}` : ''}`}
      </span>
    </div>
  )
}

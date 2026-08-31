import { useState } from 'react'

// An image that reserves its space before it arrives, and copes with a link
// that no longer works.
//
// THE PROBLEM 11c FIXES HERE: LAYOUT SHIFT.
//
// An <img> occupies ZERO height until the file has downloaded. So a feed draws
// itself with no photos in it, the pictures arrive one at a time, and each one
// shoves everything below it further down the page. If you were about to tap a
// heart, you tap something else instead. It is one of the most irritating
// things a page can do, and it is entirely avoidable.
//
// The fix is to decide the shape in ADVANCE. aspect-square makes the browser
// set aside a box the right size the moment the page draws, before it knows
// anything about the picture. When the photo lands it fills a space that was
// already there, and nothing moves.
//
// Square because that is what Instagram uses for a feed, and because a fixed
// ratio is the only thing that can be known ahead of time -- the real
// proportions of the photo are inside the file we are still waiting for.
//
// THE SECOND PROBLEM: links rot. Posts store the ADDRESS of a picture, not the
// picture itself. The site hosting it goes away and the browser draws its own
// broken-image icon, which looks like a bug in your app. onError catches that.
export default function PostImage({ src, alt, className = '' }) {
  const [broken, setBroken] = useState(false)
  const [loaded, setLoaded] = useState(false)

  return (
    // The box that holds the space. It has its size from the first moment,
    // whatever is or is not inside it.
    //
    // bg-hover gives it a soft grey fill, so an empty box reads as "a picture
    // is coming" rather than as a gap where something failed.
    <div
      className={`relative w-full overflow-hidden bg-hover ${broken ? '' : 'aspect-square'} ${className}`}
    >
      {broken ? (
        <p className="flex aspect-square items-center justify-center px-2 text-center text-tiny text-ink-muted">
          Image unavailable
        </p>
      ) : (
        <img
          src={src}
          alt={alt}
          onError={() => setBroken(true)}
          // onLoad fires once the file has actually arrived and been decoded.
          // That is the moment it is safe to show.
          onLoad={() => setLoaded(true)}
          // loading="lazy" tells the browser not to download a photo until it
          // is near the screen. On a feed of twenty posts that is nineteen
          // downloads not made on a phone connection. It is safe here precisely
          // BECAUSE the space is already reserved -- lazy loading without a
          // reserved box makes the jumping worse, not better.
          loading="lazy"
          // Fade in rather than snap in. The opacity is driven by loaded, so
          // there is no flash of a half-drawn image.
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  )
}

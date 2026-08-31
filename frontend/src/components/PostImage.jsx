import { useState } from 'react'

// An image that copes with a link that no longer works.
//
// Posts store the ADDRESS of a picture, not the picture itself -- PLAN.md
// feature 4 chose pasting a link over uploading a file. That choice has a
// consequence that only shows up later: links rot. The site hosting the
// image goes away, or renames the file, and what the browser draws is its
// own broken-image icon, which looks like a bug in your app.
//
// CreatePost already warns when you paste a link that will not load. This
// handles the same problem everywhere afterwards.
//
// onError is a normal browser event: it fires when an image fails to load.
export default function PostImage({ src, alt, className = '' }) {
  const [broken, setBroken] = useState(false)

  if (broken) {
    return (
      <div
        className={`flex items-center justify-center bg-hover text-center ${className}`}
      >
        <span className="px-2 text-xs text-ink-muted">Image unavailable</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      className={className}
    />
  )
}

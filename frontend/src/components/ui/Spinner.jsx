import { Loader2 } from 'lucide-react'

// The waiting indicator, replacing six different lines of "Loading..." text.
//
// Loader2 is a lucide icon: a circle with a gap in it. It does not spin by
// itself -- animate-spin is a Tailwind class that turns whatever it is put on,
// once a second, forever. The icon supplies the shape and CSS supplies the
// movement.
export default function Spinner({ label = 'Loading', className = '' }) {
  return (
    // role="status" tells a screen reader this region announces itself when it
    // changes, without stealing the cursor. It is how someone who cannot see
    // the spinner still hears "Loading".
    <div role="status" className={`flex justify-center py-8 ${className}`}>
      {/* aria-hidden on the icon: the shape means nothing spoken aloud, and
          without this the reader would try to describe an SVG. The words come
          from the sr-only span below instead. */}
      <Loader2
        className="h-6 w-6 animate-spin text-ink-muted"
        aria-hidden="true"
      />

      {/* sr-only is the class worth remembering. It hides this text from the
          screen while leaving it fully readable by a screen reader.
          It is NOT display:none -- that would hide it from the reader too,
          which defeats the entire point. */}
      <span className="sr-only">{label}</span>
    </div>
  )
}

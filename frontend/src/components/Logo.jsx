import { useId } from 'react'

// The Timepass symbol: an hourglass, drawn in our gradient.
//
// WHY AN HOURGLASS. The name means passing time, so the symbol and the name
// explain each other. It also survives being shrunk to 16 pixels for a browser
// tab, which is where most logos quietly fall apart.
//
// WHY IT IS A COMPONENT AND NOT AN IMAGE FILE. An SVG is not a picture, it is
// instructions for drawing one: "line from here to there, this thick". Because
// it is instructions, it stays perfectly sharp at any size -- 16 pixels in a
// tab or 96 on the signup page, same file. A .png would be blurry at one of
// those and wasteful at the other. And because it is code, the gradient can
// come from our design tokens instead of being baked into a picture.
export default function Logo({ className = 'h-8 w-8' }) {
  // A gradient in SVG has to be defined once and then referred to by name --
  // and a name has to be unique on the page. The header shows the logo, and one
  // day something else will too. Two copies both calling their gradient "brand"
  // and the second one silently wins, so one logo draws with the other's
  // colours.
  //
  // useId is React's answer: it hands back an id guaranteed not to clash with
  // any other. Never write these by hand.
  const gradientId = useId()

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      // WHY THIS MATTERS FOR ACCESSIBILITY. A screen reader cannot look at a
      // shape and work out what it is. Without a label it announces nothing at
      // all, so a blind user reaching the top of the page hears silence where
      // the app's name should be.
      //
      // role="img" says "treat this as a picture, not as a pile of shapes", and
      // aria-label is the words to read out in place of it.
      role="img"
      aria-label="Timepass"
    >
      {/* <defs> holds things that are defined but not drawn. The gradient lives
          here; the path below points at it. */}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          {/* The three brand colours from index.css. offset is how far along
              the gradient each colour sits: start, middle, end.

              Read from a CSS variable rather than typed in, so the colours are
              still decided in exactly one place. */}
          <stop offset="0%" stopColor="var(--color-brand-start)" />
          <stop offset="50%" stopColor="var(--color-brand-mid)" />
          <stop offset="100%" stopColor="var(--color-brand-end)" />
        </linearGradient>
      </defs>

      {/* The hourglass itself, as one continuous outline.
       *
       * An SVG path is a set of pen instructions on a 24 by 24 grid, where
       * 0,0 is the top-left corner:
       *
       *   M6 3     move the pen to x=6, y=3          (top-left corner)
       *   h12      draw horizontally 12 across       (the top bar)
       *   l-6 9    draw a line 6 left and 9 down     (down to the waist)
       *   6 9      then 6 right and 9 down           (out to the bottom-right)
       *   H6       draw horizontally back to x=6     (the bottom bar)
       *   l6 -9    up and right, back to the waist
       *   z        close the shape back to the start
       *
       * fill="none" and a stroke means it is drawn as an outline, not filled
       * in solid. Instagram's own mark is an outline too, and an outline stays
       * legible on both a white and a black background -- which matters here,
       * because this same logo has to work in dark mode. */}
      <path
        d="M6 3h12l-6 9 6 9H6l6-9z"
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
        // Round ends and round corners. Without these the waist of the
        // hourglass comes to a sharp spike that looks harsh at small sizes.
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

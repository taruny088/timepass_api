import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'

// The button that flips the app between light and dark.
//
// In 11a the sun and moon were drawn here by hand, because lucide-react was not
// due to be installed until this sitting. That stopgap is now gone -- these are
// the real icons, and the file is about forty lines shorter for it.
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  const isDark = theme === 'dark'

  // What the button OFFERS, not what the app currently is.
  //
  // This is the bit people get wrong. In dark mode the button shows a sun,
  // because pressing it gives you daylight. Showing a moon while already dark
  // would be labelling the button with the state you are in rather than the
  // thing it does, and everyone reads it as the second.
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      // aria-label is the text a screen reader reads out in place of the icon.
      // Without it this button announces itself as "button" and nothing more --
      // a shape means nothing to someone who cannot see it. Every icon in this
      // app needs one; there are no exceptions.
      aria-label={label}
      // title is the tooltip on hover, for sighted people who cannot tell what
      // the icon means either.
      title={label}
      // min-h-11 min-w-11 is the 44 pixel touch target. The old version was
      // p-2 around a 20px icon -- 36 pixels, and fiddly with a thumb.
      className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition active:scale-90 hover:bg-hover hover:text-ink"
    >
      {/* A lucide icon is a React component that draws an SVG, so it takes
          className like anything else and its colour comes from currentColor --
          meaning it follows the text colour set above, including on hover, and
          follows the theme with no extra work.

          aria-hidden because the button already announces itself through its
          aria-label. Without it the reader finds the shape underneath and says
          the same thing twice. */}
      {isDark ? (
        <Sun className="h-6 w-6" aria-hidden="true" />
      ) : (
        <Moon className="h-6 w-6" aria-hidden="true" />
      )}
    </button>
  )
}

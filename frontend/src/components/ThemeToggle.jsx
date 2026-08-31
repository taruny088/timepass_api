import { useTheme } from '../theme/ThemeContext'

// The button that flips the app between light and dark.
//
// A NOTE ON THESE ICONS. PLAN2 puts the icon library, lucide-react, in sitting
// 11b, and pulling it forward just for this one button is not worth breaking
// the order for. So the sun and the moon are drawn here by hand, in a few lines
// each. They get replaced with the real lucide-react icons in 11b, when every
// other icon in the app arrives at once. This is a deliberate stopgap, not
// something left behind by accident.
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
      // app needs one of these; there are no exceptions.
      aria-label={label}
      // title is the little tooltip on hover, for sighted people who cannot
      // tell what the icon means either.
      title={label}
      className="rounded-control p-2 text-ink-muted transition hover:bg-hover hover:text-ink"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

// Both icons are outlines on a 24 by 24 grid, drawn in currentColor.
//
// currentColor is a small piece of CSS magic: it means "whatever the text
// colour is here". Because the button above sets text-ink-muted, and turns it
// to text-ink on hover, the icon follows along on its own -- and it follows the
// theme too, with no extra work. An icon that took a fixed colour would need
// its own dark-mode rule.
//
// aria-hidden="true" hides these from screen readers on purpose. The button
// already announces itself through its aria-label, and without this the reader
// would find the shapes underneath and read the same thing twice.

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      {/* The eight rays, as one path: move to a point, draw a short line. */}
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {/* A crescent, made from one arc curving back on itself. */}
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

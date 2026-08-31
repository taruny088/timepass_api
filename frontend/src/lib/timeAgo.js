// Turns a stored timestamp into "2h ago".
//
// WHY THIS BELONGS ON THE FRONTEND AND NOT THE BACKEND.
//
// It looks like the server's job -- it owns the date, so why not send "2h ago"
// and be done? Two reasons, and the second is the real one.
//
// 1. Only the browser knows the reader's clock and time zone. The server knows
//    when the post was made; it does not know what "now" means where you are.
//
// 2. "2h ago" is true for exactly one hour. The moment it is cached, stored, or
//    simply left on screen while you read, it starts being wrong. A timestamp
//    is a fact and never goes stale; "2h ago" is a fact with an expiry date.
//    So the server sends the fact and the browser does the arithmetic, fresh,
//    every time it draws.
//
// This is a plain function with no React in it, which is why it lives in lib/
// rather than components/. It takes a value and returns a value -- nothing
// else. That also makes it the easiest kind of code to reason about: the same
// input always gives the same output.

// Intl.RelativeTimeFormat is built into every browser. It is what saves us
// writing "1 hour ago" vs "2 hours ago" by hand -- and, in any other language,
// rules far worse than adding an s.
//
// style: 'narrow' is what produces "2h ago" rather than "2 hours ago".
// numeric: 'always' stops it saying "yesterday" instead of "1d ago", so the
// whole list reads consistently.
//
// Built ONCE, outside the function. Creating an Intl formatter is genuinely
// slow, and a feed of twenty posts would otherwise build twenty of them on
// every single redraw.
const formatter = new Intl.RelativeTimeFormat('en', {
  style: 'narrow',
  numeric: 'always',
})

// The units, largest first, with how many seconds each one is.
//
// Order matters: the first one that fits wins. Checking seconds first would
// report a three day old post as "259200s ago".
const UNITS = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
]

export default function timeAgo(timestamp) {
  const then = new Date(timestamp)

  // A date the browser could not understand comes back as "Invalid Date", and
  // any arithmetic on it produces NaN -- which would end up drawn on screen as
  // the literal text "NaN ago". Better to show nothing than nonsense.
  if (Number.isNaN(then.getTime())) return ''

  // Positive number of seconds since it happened.
  const secondsAgo = Math.round((Date.now() - then.getTime()) / 1000)

  // Anything under a minute is "just now". Counting down the seconds on a
  // fresh comment is noise, and it would be out of date before you read it.
  //
  // Also catches a small negative: if the phone's clock is a few seconds
  // behind the server's, secondsAgo goes negative and this would otherwise
  // read "in 4s", which looks broken.
  if (secondsAgo < 60) return 'just now'

  for (const [unit, secondsInUnit] of UNITS) {
    if (secondsAgo >= secondsInUnit) {
      const amount = Math.floor(secondsAgo / secondsInUnit)
      // NEGATIVE on purpose. Intl reads the sign as direction: -2 is "2h ago",
      // +2 would be "in 2h". Getting this backwards is the classic mistake with
      // this API, and it fails silently -- every post reads as being in the
      // future.
      return formatter.format(-amount, unit)
    }
  }

  // Unreachable: anything 60 seconds or more matches "minute" at the latest.
  // Kept so the function always returns a string rather than undefined.
  return 'just now'
}

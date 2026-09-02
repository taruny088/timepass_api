// A small count bubble: the unread number on the messages icon, and the one on
// each row of the inbox.
//
// Built as a shared piece because there are already two places drawing exactly
// this, and Phase 15's notification bell will be a third. The design rules in
// CLAUDE.md are explicit about it -- build a piece once and reuse it, rather
// than writing the same bubble on each page and having them drift apart.
//
// IT DRAWS NOTHING FOR ZERO, on purpose. Every caller would otherwise need its
// own `count > 0 &&` around it, and the one that forgot would show a badge
// saying 0 -- which reads as "no messages, urgently".
export default function Badge({ count, label, className = '' }) {
  if (!count || count < 1) return null

  // Instagram's cap, and worth copying for a practical reason rather than
  // imitation: a four-figure number stretches the bubble into a lozenge and
  // pushes whatever is beside it out of place. Past a certain point the exact
  // number stops being information anyway -- "lots" is the actual message.
  const shown = count > 99 ? '99+' : count

  return (
    <span
      // min-w-5 with h-5 keeps it a circle for one digit and lets it grow into
      // a rounded rectangle for two, which is what stops "12" from being
      // squeezed or clipped.
      className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-tiny font-semibold text-on-accent ${className}`}
    >
      {shown}
      {/* The number alone is meaningless read aloud -- a screen reader would
          announce "4" with no idea what four refers to. Every icon and every
          bare number in this project carries a hidden label for the same
          reason. */}
      <span className="sr-only"> {label}</span>
    </span>
  )
}

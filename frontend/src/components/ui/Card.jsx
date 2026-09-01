// The bordered panel: a post, a search result list, the profile header, a form.
//
// Small enough to look pointless, and it is not. Five places had "rounded-xl
// border border-line bg-surface" written out, and rounded-xl is 12px by
// coincidence rather than because anyone chose it. Now the corner comes from
// rounded-card, which index.css defines once.
//
// NOTE THERE IS NO SHADOW. That is the rule, not an oversight: a card sits on
// the page with a border, not a drop shadow. Instagram is almost entirely flat,
// and that flatness is exactly why the photos stand out -- nothing else on
// screen has any depth to compete with them.
// The `as` prop: which HTML tag this actually becomes.
//
// A card is usually a <div>, but the search results are a LIST of people, and a
// list has to be a <ul> so that its <li> children are valid HTML -- and so a
// screen reader announces "list, 5 items" instead of reading five unrelated
// links. The post card is an <article>, for the same kind of reason.
//
// Renaming to a capital Tag is required. JSX decides what a tag means by its
// first letter: <as> would be looked up as an HTML element literally named
// "as". <Tag> is read as a variable holding the name.
// The `flush` prop: no border and no corners on a phone, a normal card above it.
//
// WHY THIS EXISTS, from the Phase 11 side-by-side comparison. Instagram's feed
// on a phone is EDGE TO EDGE. The photo touches both sides of the screen: no
// page padding, no border, no rounded corners. Ours was a card inside a page
// with 16px of padding, and the arithmetic is worse than it sounds:
//
//     Instagram   375px photo on a 375px screen
//     Timepass    375 - 16 - 16 (page padding) - 2 (borders) = 341px
//
// Nine percent of the photo, given away to decoration, on the one screen the
// whole app exists to show photos on. It is the difference that most makes a
// feed read as a clone rather than the real thing.
//
// From sm: up there is room to spare and a card is the better shape, which is
// why this is a prop rather than a change to every Card.
export default function Card({
  as: Tag = 'div',
  className = '',
  flush = false,
  children,
  ...rest
}) {
  // Written as two whole alternatives rather than adding "rounded-none
  // border-x-0" on top of the normal classes, and the reason is a real Tailwind
  // trap: two conflicting utilities in the same class attribute do NOT resolve
  // by which one you typed last. They resolve by which one appears later in the
  // generated stylesheet, which the author does not control. Writing
  // "rounded-card rounded-none" is a coin toss.
  //
  // Each branch below emits classes that cannot conflict with each other, so
  // what you read is what you get.
  const shape = flush
    ? 'sm:rounded-card sm:border sm:border-line'
    : 'rounded-card border border-line'

  return (
    <Tag className={`${shape} bg-surface ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

// Deliberately NO padding built in.
//
// A post card has none -- its photo must reach the edges. A form has 24px all
// round. A search result list has none, because the padding belongs to each row
// so that the whole row highlights on hover, not just its text.
//
// A padded-by-default Card would mean every one of those fighting it back off.
// The caller adds p-6 when it wants p-6.

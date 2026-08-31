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
export default function Card({
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}) {
  return (
    <Tag
      className={`rounded-card border border-line bg-surface ${className}`}
      {...rest}
    >
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

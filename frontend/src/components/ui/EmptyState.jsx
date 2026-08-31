// What a screen shows when a query came back with nothing.
//
// Four places built this by hand: an empty feed, a profile with no posts, a
// search with no matches, a post with no comments.
//
// THE RULE THIS MUST NOT BREAK. The words are not in this file. Every one of
// them is passed in by the caller, because "No posts yet" and "No one found for
// 'xyz'" are different sentences about different situations. A shared empty
// state that wrote its own message would be a placeholder -- exactly the thing
// your rules forbid. This file owns the shape; the caller owns the meaning.
export default function EmptyState({ icon, title, message, children }) {
  // PASSING A COMPONENT AS A PROP.
  //
  // The caller writes icon={Search} -- the component itself, with no angle
  // brackets. Not <Search />, which would be the drawn result; just the
  // instructions for drawing one, handed over like any other value.
  //
  // Renaming it to a capital letter is required, not stylistic. JSX decides
  // what a tag means by its first letter: <icon /> would be looked up as an
  // HTML element named "icon", find nothing, and render nothing at all. <Icon />
  // is read as a variable holding a component.
  const Icon = icon

  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      {/* Icon is optional, so it is only drawn when one was given. */}
      {Icon && (
        <Icon className="mb-4 h-12 w-12 text-ink-muted" aria-hidden="true" />
      )}

      <p className="text-h2 font-semibold text-ink">{title}</p>

      {message && (
        <p className="mt-2 max-w-xs text-body text-ink-muted">{message}</p>
      )}

      {/* Room for a way out -- a button or a link -- when there is something
          useful to offer. An empty feed can suggest finding people to follow.
          Nothing is drawn when the caller passes nothing. */}
      {children && <div className="mt-6">{children}</div>}
    </div>
  )
}

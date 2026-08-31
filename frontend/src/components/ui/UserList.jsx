import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import EmptyState from './EmptyState'
import Spinner from './Spinner'

// A list of people: avatar, username, full name, linking to each profile.
//
// This row already existed in Search. 11c-ii needs the same row twice more --
// the followers list and the following list -- so it moves here rather than
// being written out three times and drifting apart.
//
// It owns its own loading, error and empty states, because all three callers
// need exactly the same three, and a caller that had to remember them would
// eventually forget one.
//
// WHAT IT DOES NOT OWN: the words. emptyTitle and emptyMessage are passed in,
// because "No followers yet" and "No one found for 'xyz'" are different
// sentences about different situations. Same rule as EmptyState -- this file
// owns the shape, the caller owns the meaning.
export default function UserList({
  people,
  loading = false,
  error = '',
  emptyIcon,
  emptyTitle,
  emptyMessage,
  // Called when a row is clicked. The modal uses it to close itself, since
  // navigating to a profile while the dialog is still open would leave it
  // covering the page you just asked for.
  onNavigate,
}) {
  if (loading) return <Spinner label="Loading people" />

  if (error) {
    return (
      <p className="px-4 py-6 text-center text-small text-danger">{error}</p>
    )
  }

  if (people.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        message={emptyMessage}
      />
    )
  }

  return (
    <ul className="divide-y divide-line">
      {people.map((person) => (
        <li key={person.id}>
          <Link
            to={`/profile/${person.username}`}
            onClick={onNavigate}
            className="flex items-center gap-3 px-4 py-3 transition active:bg-hover hover:bg-hover"
          >
            <Avatar
              src={person.avatar_url}
              username={person.username}
              size="md"
            />

            {/* min-w-0 is what lets truncate work. Without it this column
                refuses to shrink below its own text, so a long username pushes
                the row wider instead of being cut off with an ellipsis. The two
                always go together. */}
            <div className="min-w-0">
              <p className="truncate text-strong font-semibold text-ink">
                {person.username}
              </p>
              {person.full_name && (
                <p className="truncate text-small text-ink-muted">
                  {person.full_name}
                </p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

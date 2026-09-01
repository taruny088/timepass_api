import { MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import BottomNav from '../components/BottomNav'
import Header from '../components/Header'
import Avatar from '../components/ui/Avatar'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import timeAgo from '../lib/timeAgo'

// The inbox: every conversation you are part of, most recent first.
//
// Everything on this screen comes from GET /conversations, which does the
// counting and the sorting. Nothing here is worked out in the browser -- the
// unread number is a real count from a real query, not a tally kept on this
// page that would drift the moment anything happened in another tab.
export default function Messages() {
  const { user } = useAuth()

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // The same race-condition guard as Profile.jsx. If this screen is left and
    // returned to quickly, two requests are in flight and can come back in
    // either order -- so the cleanup flips this flag and a stale reply is
    // thrown away rather than drawn over a newer one.
    let ignore = false

    api
      .get('/conversations')
      .then((response) => {
        if (!ignore) setConversations(response.data)
      })
      .catch((err) => {
        if (!ignore) setError(err.userMessage || 'Could not load your messages.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <main className="mx-auto max-w-lg px-4 py-6 pb-24 md:pb-8">
        <h1 className="mb-4 text-h1 font-semibold text-ink">Messages</h1>

        {loading && <Spinner label="Loading your messages" />}

        {!loading && error && (
          <div className="rounded-card border border-danger-line bg-danger-soft p-6 text-center">
            <p className="text-body text-danger">{error}</p>
          </div>
        )}

        {/* Empty because the query came back empty, not because a placeholder
            was left behind. A brand-new account genuinely has no conversations,
            and the useful thing to say is how to start one. */}
        {!loading && !error && conversations.length === 0 && (
          <EmptyState
            icon={MessageCircle}
            title="No messages yet"
            message="Find somebody and open their profile to start a conversation."
          >
            <Link to="/search">
              <Button variant="primary">Find people</Button>
            </Link>
          </EmptyState>
        )}

        {!loading && !error && conversations.length > 0 && (
          // A <ul> because this is a list of things, and a screen reader then
          // announces "list, 4 items" instead of reading four unrelated links.
          <Card as="ul">
            {conversations.map((conversation) => (
              <li key={conversation.id} className="border-b border-line last:border-b-0">
                {/* The WHOLE ROW is the link, not just the name. A row that
                    only responds where the text happens to be is a row people
                    tap twice. */}
                <Link
                  to={`/messages/${conversation.id}`}
                  className="flex items-center gap-3 p-3 transition hover:bg-hover"
                >
                  <Avatar
                    src={conversation.other_user.avatar_url}
                    username={conversation.other_user.username}
                    size="md"
                  />

                  {/* min-w-0 is what lets the preview line truncate instead of
                      pushing the timestamp off the screen. A flex item refuses
                      to shrink below its own content unless told otherwise, and
                      this is how it is told. */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-strong font-semibold text-ink">
                      {conversation.other_user.username}
                    </p>

                    <p
                      className={`truncate text-small ${
                        conversation.unread_count > 0
                          ? 'font-semibold text-ink'
                          : 'text-ink-muted'
                      }`}
                    >
                      {/* Three real states, not two. A conversation that was
                          started and never written in has no last message --
                          pressing Message and typing nothing leaves exactly
                          that, so it needs its own words rather than a blank. */}
                      {conversation.last_message
                        ? `${
                            conversation.last_message.sender_id === user.id
                              ? 'You: '
                              : ''
                          }${conversation.last_message.body}`
                        : 'No messages yet'}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-tiny text-ink-muted">
                      {timeAgo(
                        conversation.last_message
                          ? conversation.last_message.created_at
                          : conversation.created_at,
                      )}
                    </span>

                    {conversation.unread_count > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-tiny font-semibold text-on-accent">
                        {conversation.unread_count}
                        {/* The number alone is meaningless to a screen reader,
                            which would read "4" with no idea what four means. */}
                        <span className="sr-only"> unread messages</span>
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </Card>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

import { MessageCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useSocket } from '../realtime/SocketContext'
import BottomNav from '../components/BottomNav'
import Header from '../components/Header'
import Avatar from '../components/ui/Avatar'
import Badge from '../components/ui/Badge'
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
  const { subscribe, openCount } = useSocket()

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Bumped when something happens that this screen cannot work out for itself
  // and has to ask the server about. See the live-update effect below.
  const [refreshKey, setRefreshKey] = useState(0)

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
  }, [refreshKey])

  // --- refetch when a dropped connection comes back -------------------------
  //
  // WHY THE WHOLE INBOX rather than patching it up. While the connection was
  // down, anything could have happened: new messages in three conversations,
  // an entirely new conversation from somebody who has never written before,
  // messages read on your phone. There is no list of what was missed, so the
  // honest thing is to ask for the current state.
  //
  // THE REF IS NOT DECORATION. openCount goes from 0 to 1 a moment after the
  // app opens, when the socket finishes connecting. Putting openCount straight
  // into the dependency list above would therefore fetch the inbox twice on
  // every page load -- once on arriving, once when the connection came up a
  // few hundred milliseconds later. Comparing against the value seen last time
  // is what separates "a NEW connection, so catch up" from "the first one,
  // where there is nothing to catch up on". Chat.jsx does the same.
  const lastSeenOpenCount = useRef(openCount)

  useEffect(() => {
    if (openCount === lastSeenOpenCount.current) return

    lastSeenOpenCount.current = openCount
    setRefreshKey((key) => key + 1)
  }, [openCount])

  // --- live updates ---------------------------------------------------------
  //
  // The inbox reorders itself while you are looking at it: a new message moves
  // its conversation to the top, updates the preview line and lights up the
  // badge. No refreshing, which is the entire point of this phase.
  //
  // A REF HOLDING THE SAME LIST THE SCREEN IS SHOWING. The listener below is
  // set up once and then lives for as long as this screen does, so the
  // `conversations` variable it captured would be frozen at whatever it was
  // that first time -- a classic React trap known as a stale closure. A ref is
  // one box that is always current, so reading .current inside the listener
  // gives today's list rather than the one from when it was created.
  const conversationsRef = useRef(conversations)

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === 'message.read') {
        // You read this conversation somewhere else -- on your phone, or in
        // another tab. Clear its badge here to match.
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === event.conversation_id
              ? { ...conversation, unread_count: 0 }
              : conversation,
          ),
        )
        return
      }

      if (event.type !== 'message.new') return

      const known = conversationsRef.current.some(
        (conversation) => conversation.id === event.conversation_id,
      )

      // A CONVERSATION THIS SCREEN HAS NEVER SEEN, which is a real case and
      // not an edge one: somebody who has never written to you before just
      // did. There is no row to update, and no way to invent one -- the push
      // carries the message, not the other person's name and photo.
      //
      // So ask the server for the inbox again. Bumping this number is what
      // makes the fetch above run a second time; it is in that effect's
      // dependency list next to openCount.
      if (!known) {
        setRefreshKey((key) => key + 1)
        return
      }

      setConversations((current) => {
        const index = current.findIndex((c) => c.id === event.conversation_id)
        if (index === -1) return current

        const updated = {
          ...current[index],
          last_message: event.message,
          // Your own message is not unread to you. The server pushes it here
          // as well, so that your other devices stay in step.
          unread_count:
            event.message.sender_id === user.id
              ? current[index].unread_count
              : current[index].unread_count + 1,
        }

        // MOST RECENT FIRST, so the conversation that just received something
        // jumps to the top -- the same order the server sorts by, kept correct
        // here rather than left to drift until the next reload.
        return [updated, ...current.filter((_, i) => i !== index)]
      })
    })
  }, [subscribe, user.id])

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

                    {/* The same bubble the header draws, from
                        components/ui/Badge.jsx. It was written out by hand
                        here until 16c needed a second one; two copies of the
                        same thing is exactly what the shared-pieces rule in
                        CLAUDE.md exists to prevent.

                        No `count > 0 &&` around it -- Badge draws nothing for
                        zero itself. */}
                    <Badge
                      count={conversation.unread_count}
                      label="unread messages"
                    />
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

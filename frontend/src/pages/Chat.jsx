import { ArrowLeft, Send } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import MessageBubble from '../components/MessageBubble'
import Avatar from '../components/ui/Avatar'
import Spinner from '../components/ui/Spinner'

// One conversation.
//
// THIS SCREEN BEHAVES BACKWARDS FROM EVERY OTHER PAGE IN THE APP, in three
// ways, and all three are about scroll position:
//
//   It opens at the BOTTOM, not the top, because the newest message is the
//   point of opening it.
//
//   Loading older messages must not move what you are reading. Thirty messages
//   arriving above your eyes would otherwise shove the screen down.
//
//   A new message should pull the screen down to it -- but only if you were
//   already at the bottom. Yanking somebody out of the history they are reading
//   is worse than making them scroll.
//
// Those three are the real work of this sitting. The rest is a form.

// How many pixels from the bottom still counts as "at the bottom". Some slack
// is needed: a browser's scroll maths is not exact, and a few pixels out would
// make the app decide you had scrolled away when you had not moved.
const NEAR_BOTTOM_PX = 120

// How close to the top before older messages start loading. Loading a little
// early means they are usually there before you reach the end.
const NEAR_TOP_PX = 80

export default function Chat() {
  const { conversationId } = useParams()
  const { user } = useAuth()

  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [text, setText] = useState('')

  // The scrolling box itself, so its scroll position can be read and set.
  //
  // A REF is a box React keeps for you between redraws, and changing it does
  // NOT cause a redraw. That is exactly right here: scroll position changes
  // constantly and none of it should redraw anything.
  const scrollRef = useRef(null)

  // Whether the screen should follow new messages. True while you are at the
  // bottom, false the moment you scroll up to read.
  const stickToBottomRef = useRef(true)

  // Set just before older messages are added, so the layout effect below knows
  // to put the screen back where it was. Null the rest of the time.
  const restoreRef = useRef(null)

  // The id for the next not-yet-sent message. COUNTS DOWNWARDS FROM -1.
  //
  // Negative on purpose: PostgreSQL only ever hands out positive ids, so a
  // temporary id can never collide with a real one. That means "find the
  // message I just added and replace it with the server's version" is a
  // reliable lookup rather than a guess.
  const nextTempId = useRef(-1)

  // --- loading -------------------------------------------------------------

  useEffect(() => {
    let ignore = false

    setLoading(true)
    setError('')

    // Both at once rather than one after the other. They do not depend on each
    // other, so waiting for the first before starting the second would double
    // the time this screen takes to appear.
    Promise.all([
      api.get(`/conversations/${conversationId}`),
      api.get(`/conversations/${conversationId}/messages`),
    ])
      .then(([conversationResponse, messagesResponse]) => {
        if (ignore) return
        setConversation(conversationResponse.data)
        setMessages(messagesResponse.data)
        setHasMore(messagesResponse.data.length > 0)

        // Clear the unread badge. A POST, not something the fetch above does
        // quietly -- see mark_read in backend/app/messages.py for why that
        // distinction matters.
        //
        // Deliberately not awaited and its failure ignored: whether the badge
        // clears is not worth showing an error over, and certainly not worth
        // blocking the messages appearing.
        api.post(`/conversations/${conversationId}/read`).catch(() => {})
      })
      .catch((err) => {
        // A 404 here means the conversation does not exist OR is not yours, and
        // the backend deliberately does not say which. So neither does this.
        if (!ignore) setError(err.userMessage || 'Could not open this conversation.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [conversationId])

  // --- scroll position -----------------------------------------------------

  // useLayoutEffect, NOT useEffect, and this is the one place in the app where
  // the difference is visible.
  //
  // useEffect runs AFTER the browser has painted. Setting the scroll position
  // there means the new messages are drawn in the wrong place first and then
  // jump, which reads as a glitch. useLayoutEffect runs after React has updated
  // the page but BEFORE the browser paints, so the position is already correct
  // the first time anybody sees it.
  //
  // The rule: useEffect for talking to the outside world, useLayoutEffect for
  // measuring or adjusting the page before it is shown.
  useLayoutEffect(() => {
    const box = scrollRef.current
    if (!box) return

    // CASE 1: older messages were just added above.
    //
    // Keep the reader exactly where they were. The page has grown taller by
    // however much those messages take up, so scrolling down by that same
    // amount leaves what they were reading under their eyes, unmoved.
    //
    // Without this the new messages push everything down and the reader is
    // suddenly somewhere else entirely, which is the single most annoying bug
    // in any chat.
    if (restoreRef.current !== null) {
      const heightBefore = restoreRef.current
      box.scrollTop = box.scrollTop + (box.scrollHeight - heightBefore)
      restoreRef.current = null
      return
    }

    // CASE 2: a new message at the bottom, or the screen has just opened.
    // Follow it -- but only if the reader was already down here.
    if (stickToBottomRef.current) {
      box.scrollTop = box.scrollHeight
    }
  }, [messages])

  function handleScroll() {
    const box = scrollRef.current
    if (!box) return

    // Are we at the bottom? This is read on every scroll and decides whether
    // the next arriving message pulls the screen with it.
    const distanceFromBottom =
      box.scrollHeight - box.scrollTop - box.clientHeight
    stickToBottomRef.current = distanceFromBottom < NEAR_BOTTOM_PX

    // Near the top, so fetch what came before.
    if (box.scrollTop < NEAR_TOP_PX && hasMore && !loadingOlder && messages.length) {
      loadOlder()
    }
  }

  async function loadOlder() {
    const box = scrollRef.current
    if (!box) return

    setLoadingOlder(true)

    // Measured BEFORE the new messages exist. Case 1 above uses it to work out
    // how much taller the page became.
    restoreRef.current = box.scrollHeight

    try {
      // THE CURSOR. "Older than the oldest one I have" -- not "skip 30", which
      // would silently duplicate or lose a message every time a new one arrived
      // at the other end of the list. See read_messages in the backend.
      const oldestId = messages[0].id
      const response = await api.get(
        `/conversations/${conversationId}/messages?before=${oldestId}`,
      )

      if (response.data.length === 0) {
        // Nothing older exists. Stop asking, and cancel the restore -- there is
        // nothing to restore to, and leaving it set would misplace the screen
        // on the next unrelated change.
        setHasMore(false)
        restoreRef.current = null
        return
      }

      setMessages((current) => [...response.data, ...current])
    } catch {
      // Quiet on purpose. Failing to load history is not worth an error box
      // over the conversation -- scrolling up again retries it.
      restoreRef.current = null
    } finally {
      setLoadingOlder(false)
    }
  }

  // --- sending -------------------------------------------------------------

  async function handleSend(event) {
    event.preventDefault()

    const body = text.trim()
    if (!body) return

    // AN OPTIMISTIC UPDATE: the message goes on screen immediately, before the
    // server has been asked, and is corrected if the server disagrees.
    //
    // The alternative is waiting for the reply, which on a phone -- or on a
    // Render backend waking from sleep -- can be a second or more of a chat
    // that appears to have ignored you.
    //
    // useLike.js does the same thing for the heart. The half people forget is
    // the failure: a message that silently disappears is far worse than an
    // error, because you believe you sent it. So a failed one stays on screen,
    // greyed, marked, with a way to try again.
    const tempId = nextTempId.current
    nextTempId.current -= 1

    const optimistic = {
      id: tempId,
      conversation_id: Number(conversationId),
      sender_id: user.id,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      pending: true,
    }

    setMessages((current) => [...current, optimistic])
    setText('')

    // Sending is always a reason to jump to the bottom, wherever you were
    // reading -- you just wrote it, so you want to see it.
    stickToBottomRef.current = true

    await deliver(tempId, body)
  }

  async function deliver(tempId, body) {
    try {
      const response = await api.post(
        `/conversations/${conversationId}/messages`,
        { body },
      )

      // Swap our placeholder for the server's version. The real id matters: it
      // is the cursor for loading older messages, and in 16c it is how this
      // same message is recognised when it arrives back down the live
      // connection, so it is not drawn twice.
      setMessages((current) =>
        current.map((message) =>
          message.id === tempId ? response.data : message,
        ),
      )
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === tempId
            ? { ...message, pending: false, failed: true }
            : message,
        ),
      )
    }
  }

  function handleRetry(message) {
    setMessages((current) =>
      current.map((m) =>
        m.id === message.id ? { ...m, pending: true, failed: false } : m,
      ),
    )
    deliver(message.id, message.body)
  }

  // --- drawing -------------------------------------------------------------

  // h-dvh, not h-screen. On a phone, h-screen (100vh) means the window with the
  // browser's own bars counted in, so the composer ends up hidden behind them.
  // dvh is the space actually visible right now, and it changes as those bars
  // slide away.
  //
  // No BottomNav on this screen, which is what Instagram does too: a chat wants
  // every pixel it can get, especially with a keyboard open.
  return (
    <div className="flex h-dvh flex-col bg-surface">
      {/* The chat's own header. Not the app Header -- this one has to say who
          you are talking to, and a back arrow, because a chat is somewhere you
          go INTO rather than a place in the main navigation. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <Link
          to="/messages"
          aria-label="Back to messages"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink transition active:scale-90 hover:bg-hover"
        >
          <ArrowLeft className="h-6 w-6" aria-hidden="true" />
        </Link>

        {conversation && (
          <Link
            to={`/profile/${conversation.other_user.username}`}
            className="flex min-w-0 items-center gap-3"
          >
            <Avatar
              src={conversation.other_user.avatar_url}
              username={conversation.other_user.username}
              size="sm"
            />
            <span className="truncate text-strong font-semibold text-ink">
              {conversation.other_user.username}
            </span>
          </Link>
        )}
      </header>

      {/* flex-1 makes this take all the space left between the header and the
          composer, and overflow-y-auto makes it the thing that scrolls -- not
          the page. That is what keeps the composer pinned to the bottom
          without any fixed positioning. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {loading && <Spinner label="Loading conversation" />}

        {!loading && error && (
          <div className="rounded-card border border-danger-line bg-danger-soft p-6 text-center">
            <p className="text-body text-danger">{error}</p>
            <Link to="/messages" className="mt-3 inline-block text-small underline">
              Back to messages
            </Link>
          </div>
        )}

        {!loading && !error && (
          <>
            {loadingOlder && (
              <p className="pb-4 text-center text-tiny text-ink-muted">
                Loading older messages...
              </p>
            )}

            {!hasMore && messages.length > 0 && (
              <p className="pb-4 text-center text-tiny text-ink-muted">
                This is the beginning of your conversation.
              </p>
            )}

            {messages.length === 0 && (
              <p className="py-12 text-center text-body text-ink-muted">
                No messages yet. Say hello.
              </p>
            )}

            <div className="space-y-2">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  // Which side of the screen it sits on. Compared against the
                  // logged-in user rather than trusted from the message, so a
                  // message can never claim to be yours.
                  isMine={message.sender_id === user.id}
                  onRetry={handleRetry}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* The composer. shrink-0 so it keeps its height when the message list
          grows -- without it, flex would squeeze the box you are typing into. */}
      <form
        onSubmit={handleSend}
        className="flex shrink-0 items-end gap-2 border-t border-line p-3"
      >
        <label htmlFor="message-box" className="sr-only">
          Write a message
        </label>
        {/* A textarea, not an input, so a message can have more than one line.
            rows=1 keeps it the height of a single line until it needs more. */}
        <textarea
          id="message-box"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Message..."
          rows={1}
          maxLength={2000}
          disabled={loading || !!error}
          className="max-h-32 min-h-11 w-full resize-none rounded-control border border-line bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-muted outline-none transition focus:border-ink"
        />

        <button
          type="submit"
          // Disabled on an empty box rather than sending nothing and letting the
          // backend refuse it with a 422. The backend still checks, because
          // anything in a browser can be bypassed.
          disabled={!text.trim() || loading || !!error}
          aria-label="Send message"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control bg-accent text-on-accent transition active:scale-90 hover:bg-accent-hover disabled:bg-accent-soft"
        >
          <Send className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}

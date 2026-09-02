import { ArrowLeft, Send } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useSocket } from '../realtime/SocketContext'
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

// Add a message that arrived over the live connection, without ever drawing
// the same one twice.
//
// TWO WAYS A DUPLICATE HAPPENS, and both are real:
//
//   1. The server pushes every new message to BOTH people, including the
//      sender -- because you might have the app open on a phone and a laptop
//      and the other one has to see it too. So the tab that sent it gets it
//      back, and already has it on screen.
//
//   2. Catching up after a reconnection can fetch a message that also arrived
//      as a push a moment later.
//
// The id check handles both. Note it returns the ORIGINAL array when nothing
// changed: React skips redrawing when the value is the same object, so an
// ignored duplicate costs nothing at all.
function addMessage(messages, incoming) {
  if (messages.some((message) => message.id === incoming.id)) return messages

  // THE RACE THIS SECOND CHECK EXISTS FOR. When you send a message, it goes on
  // screen immediately with a temporary negative id, and the POST replaces it
  // with the saved version a moment later. But the push travels separately and
  // can arrive FIRST -- and then, for an instant, the same message is on
  // screen twice: once as your placeholder and once as the real thing.
  //
  // So if this is our own message and a placeholder is still waiting, the real
  // version takes its place rather than being added beside it.
  //
  // Matching on the text is a guess rather than a proof, and it is a safe one:
  // the worst it can do is reuse a bubble when you send the same words twice
  // in the same second, which looks identical either way.
  const placeholder = messages.findIndex(
    (message) =>
      message.pending &&
      message.sender_id === incoming.sender_id &&
      message.body === incoming.body,
  )

  if (placeholder !== -1) {
    const copy = [...messages]
    copy[placeholder] = incoming
    return copy
  }

  return [...messages, incoming]
}

// The newest message the screen actually has, ignoring anything not yet saved.
//
// Placeholders count DOWN from -1, and the server only ever hands out positive
// ids, so filtering to positives is what keeps a temporary id from being sent
// to the server as a cursor -- which would ask for "everything after -3" and
// fetch the entire conversation.
function newestSavedId(messages) {
  let newest = null

  for (const message of messages) {
    if (message.id > 0 && (newest === null || message.id > newest)) {
      newest = message.id
    }
  }

  return newest
}

export default function Chat() {
  const { conversationId } = useParams()
  const { user } = useAuth()
  const { subscribe, isConnected, openCount } = useSocket()

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

  // The message box itself, so the cursor can be put in it when the screen
  // opens. See the focus effect below.
  const composerRef = useRef(null)

  // Set when a message arrives while this tab is in the background, so it can
  // be marked read the moment you come back to it. See the live-delivery
  // handler and the visibility effect below.
  const arrivedWhileHiddenRef = useRef(false)

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

  // --- live delivery -------------------------------------------------------

  // The same stale-closure guard as Messages.jsx: the listener below is created
  // once and lives as long as this screen, so it must not read `messages`
  // directly -- it would forever see the empty list from the moment it was
  // made. A ref is one box that is always current.
  const messagesRef = useRef(messages)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    return subscribe((event) => {
      if (event.type !== 'message.new') return

      // ONE SOCKET CARRIES EVERY CONVERSATION YOU ARE IN, so a message for a
      // different chat arrives here too and must be ignored. useParams hands
      // back the id from the address as text, and the push carries it as a
      // number, so one of them has to be converted -- comparing them directly
      // would be false every single time, and the chat would silently never
      // update.
      if (event.conversation_id !== Number(conversationId)) return

      setMessages((current) => addMessage(current, event.message))

      if (event.message.sender_id === user.id) return

      // A message arrived while you are looking at the conversation, so it has
      // been read. Without this the badge in the header would count a message
      // that is on the screen in front of you.
      //
      // ONLY IF THE TAB IS ACTUALLY VISIBLE. A chat left open in a background
      // tab is not being read, and marking it read would clear the badge for a
      // message nobody has seen -- the same mistake the backend avoids by
      // refusing to mark messages read on a GET.
      if (document.visibilityState === 'visible') {
        api.post(`/conversations/${conversationId}/read`).catch(() => {})
        return
      }

      // THE TAB IS HIDDEN, so remember that something arrived unread. The
      // effect below marks it when you come back.
      //
      // THE BUG THIS FIXES, because it is a good example of a half-finished
      // rule. Skipping the mark while hidden is right. But nothing was
      // finishing the job afterwards, so a message that arrived while you were
      // in another tab stayed unread FOREVER -- the chat was open, the message
      // was on screen, and the header still insisted there was something to
      // read. Re-opening the conversation was the only thing that cleared it,
      // because that is the one other place that marks messages read.
      //
      // A ref rather than state: nothing on screen is drawn from this, so
      // changing it should not cause a redraw.
      arrivedWhileHiddenRef.current = true
    })
  }, [subscribe, conversationId, user.id])

  // --- catching up after a drop ---------------------------------------------
  //
  // THIS IS THE PART THAT MAKES A DROPPED CONNECTION SURVIVABLE, and it is
  // easy to leave out because everything looks fine without it until the day
  // it does not.
  //
  // While the connection is down, messages are still being saved. They are
  // pushed into a socket nobody is holding, and they are gone. Reconnecting
  // does not bring them back -- the connection has no memory of what it missed.
  // So the screen asks for everything newer than the last message it has.
  //
  // openCount is the counter from SocketContext: how many times the connection
  // has become usable. Comparing it with the value seen on the previous run is
  // what tells "this is a NEW connection" apart from "this is the first one",
  // where there is nothing to catch up on.
  const lastSeenOpenCount = useRef(openCount)

  useEffect(() => {
    if (openCount === lastSeenOpenCount.current) return

    lastSeenOpenCount.current = openCount

    const newest = newestSavedId(messagesRef.current)

    // Nothing saved yet, so there is no cursor to count from and nothing can
    // have been missed.
    if (newest === null) return

    api
      .get(`/conversations/${conversationId}/messages?after=${newest}`)
      .then((response) => {
        if (response.data.length === 0) return

        // Added one at a time through the same function the live push uses, so
        // a message that arrived BOTH ways -- fetched here and pushed a moment
        // later -- is still only drawn once.
        setMessages((current) =>
          response.data.reduce(addMessage, current),
        )

        if (document.visibilityState === 'visible') {
          api.post(`/conversations/${conversationId}/read`).catch(() => {})
        }
      })
      // Quiet: the next reconnection tries again, and an error box over a
      // conversation that is working is worse than a short gap.
      .catch(() => {})
  }, [openCount, conversationId])

  // --- the cursor starts in the message box ---------------------------------
  //
  // Opening a conversation means you are about to type, so the cursor should
  // already be there rather than needing a click first.
  //
  // AFTER LOADING, NOT ON ARRIVAL, and this is the part that would quietly not
  // work. The box is disabled while the messages are being fetched, and a
  // disabled element cannot be focused -- the browser refuses, silently. So
  // `loading` is in the dependency list: the effect runs again the moment the
  // box becomes usable, and that is the run that actually does something.
  //
  // (It is why the plain `autoFocus` attribute is no good here. It fires once,
  // when the element first appears, which is exactly the moment it is still
  // disabled.)
  //
  // NOT ON A PHONE, on purpose. Focusing a text box on a touch device opens
  // the on-screen keyboard, which swallows half the screen -- so opening a
  // conversation would hide the conversation. The messages are the reason you
  // opened it; the keyboard should appear when you decide to type. Instagram
  // behaves the same way, and it is the same "(pointer: coarse)" test that
  // decides whether Enter sends.
  useEffect(() => {
    if (loading || error) return
    if (window.matchMedia('(pointer: coarse)').matches) return

    // ?. because the box is not on the page at all while an error is showing,
    // and a ref to something that was never drawn is null.
    composerRef.current?.focus()
  }, [loading, error, conversationId])

  // --- coming back to the tab ------------------------------------------------
  //
  // Marks read anything that arrived while you were somewhere else. Without
  // this, the visibility check in the live handler above is a rule with no
  // second half: it correctly refuses to mark a message read while nobody is
  // looking, and then nothing ever notices that somebody is looking again.
  //
  // Guarded by the ref rather than firing on every tab switch. Marking read
  // when there is nothing unread is harmless -- the backend answers "marked 0"
  // and tells nobody -- but a request on every switch between tabs, forever,
  // for nothing, is not a thing to leave in.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      if (!arrivedWhileHiddenRef.current) return

      arrivedWhileHiddenRef.current = false
      api.post(`/conversations/${conversationId}/read`).catch(() => {})
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
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
      // is the cursor for loading older messages, and it is how this same
      // message is recognised when it arrives back down the live connection so
      // it is not drawn twice.
      //
      // THE PUSH MAY HAVE BEATEN THIS REPLY. The server saves the message,
      // pushes it, and then answers the POST -- and those two travel
      // separately, so the pushed copy can land first. If it did, addMessage
      // has already turned our placeholder into the real message, and mapping
      // over tempId would find nothing while the real one is already there.
      //
      // So: if the saved message is already on screen, just make sure no
      // placeholder is left beside it.
      setMessages((current) => {
        const alreadyDrawn = current.some(
          (message) => message.id === response.data.id,
        )

        if (alreadyDrawn) {
          return current.filter((message) => message.id !== tempId)
        }

        return current.map((message) =>
          message.id === tempId ? response.data : message,
        )
      })
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

  // ENTER SENDS. Shift+Enter starts a new line.
  //
  // WHY THIS IS NEEDED AT ALL, because it looks like the form should already
  // handle it. In a <form>, pressing Enter inside an <input> submits it -- that
  // is a browser rule, and it is why every other form in this app works without
  // a line of key handling.
  //
  // A <textarea> is deliberately exempt from that rule. Enter inside one means
  // "new line", because a textarea exists for text that has more than one line
  // in it. So the composer here -- which is a textarea precisely so a message
  // CAN have more than one line -- swallowed Enter and never sent anything.
  //
  // preventDefault() stops the newline that Enter would otherwise insert. Miss
  // it and the message sends AND leaves a blank line behind in the box.
  function handleKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey) return

    // ON A PHONE, ENTER MUST STILL MEAN NEW LINE. A touch keyboard has no
    // Shift+Enter to fall back on, so sending on Enter there would make a
    // two-line message impossible to type -- and the Send button is right
    // beside your thumb anyway, which is not true of a mouse.
    //
    // "(pointer: coarse)" is the browser's own way of saying "this is being
    // pointed at with a finger rather than a mouse". Better than guessing from
    // the screen width, which says nothing about how it is being touched.
    if (window.matchMedia('(pointer: coarse)').matches) return

    // COMPOSING. Typing Japanese, Chinese or Korean -- and using predictive
    // input on many phone keyboards -- builds a character up over several key
    // presses, and Enter CONFIRMS the one being built. Sending on that Enter
    // would fire the message off mid-word, every time.
    //
    // isComposing is true only during that. It lives on nativeEvent because it
    // belongs to the browser's own event, not to React's copy of it.
    if (event.nativeEvent.isComposing) return

    event.preventDefault()
    handleSend(event)
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

      {/* WHEN THE LIVE CONNECTION IS DOWN, SAY SO.

          Without this the chat does not look broken -- it looks quiet, which
          is exactly the same thing on screen and completely different in
          truth. Somebody sends a message, gets no reply, and concludes they
          are being ignored.

          Sending still works while this is showing, because messages are sent
          with an ordinary request and only RECEIVED over the socket. So the
          wording promises a delay, not a failure.

          role="status" is what tells a screen reader to announce this when it
          appears, rather than only finding it if the user happens to go
          looking. shrink-0 so it does not get squeezed by the message list
          growing. */}
      {!loading && !error && !isConnected && (
        <p
          role="status"
          className="shrink-0 bg-hover px-4 py-2 text-center text-tiny text-ink-muted"
        >
          Reconnecting... new messages may take a moment to appear.
        </p>
      )}

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
          ref={composerRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
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

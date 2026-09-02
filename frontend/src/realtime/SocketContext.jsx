import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { STATUS, createSocket } from '../lib/socket'

// ONE live connection for the whole app.
//
// WHY ONE, AND NOT ONE PER SCREEN. Three separate places want pushed
// messages: the chat screen, the inbox, and the unread badge in the header.
// If each opened its own connection, tapping into a chat would open a second
// socket while the header still held a third, the server would push every
// message three times, and closing a screen would sometimes take down a
// connection another screen was still using.
//
// So the connection is opened once, here, and everything else subscribes to
// it. This is exactly what AuthContext does for "who is logged in": one owner,
// many readers.
//
// A CONTEXT, as in AuthContext, is how a value is made available to any
// component inside it without being passed down by hand through every level in
// between.
const SocketContext = createContext(null)

export function useSocket() {
  const context = useContext(SocketContext)
  if (context === null) {
    throw new Error('useSocket must be used inside <SocketProvider>')
  }
  return context
}

export function SocketProvider({ children }) {
  const { user } = useAuth()

  // THE SOCKET ITSELF LIVES IN A REF, not in state, and the difference matters.
  //
  // A ref is a box React keeps between redraws, and changing it does not cause
  // a redraw. That is right here twice over: the connection object never
  // changes once made, and nothing on screen is drawn from it directly.
  //
  // Put it in useState and it would be rebuilt on some redraws, quietly
  // replacing a working connection with a new one. Put it in a plain variable
  // inside this function and it would be rebuilt on EVERY redraw, which is
  // worse.
  const socketRef = useRef(null)

  // Made once, the first time this component runs. Not in useState's initial
  // value, because that would be a slightly obscure way of writing the same
  // thing, and not in a useEffect, because the value is needed immediately by
  // the code below.
  if (socketRef.current === null) {
    socketRef.current = createSocket()
  }

  const socket = socketRef.current

  // The connection state, mirrored into React state so screens redraw when it
  // changes. This is the "Reconnecting..." strip on the chat screen.
  const [status, setStatus] = useState(socket.getStatus)

  // HOW MANY TIMES THE CONNECTION HAS BECOME USABLE since the app loaded.
  //
  // This exists for one job: catching up. When the connection drops, messages
  // sent during the gap are pushed into a socket nobody is holding and are
  // lost. Reconnecting does not bring them back -- the screen has to go and
  // fetch them.
  //
  // A screen cannot just watch `status` for that, because "connected" is also
  // true the very first time, when there is nothing to catch up on. A counter
  // gives each connection a number, so a screen can notice "this is a
  // different connection from the one I had" and fetch the gap. See Chat.jsx.
  const [openCount, setOpenCount] = useState(0)

  // user?.id, NOT user, and this is a real bug avoided rather than a style
  // preference.
  //
  // `user` is an object, and React compares dependencies by identity. Editing
  // your profile or uploading an avatar replaces that object with a new one
  // holding almost the same values -- a different object as far as React is
  // concerned. Depending on `user` would tear down a perfectly healthy
  // connection and build a new one every time the avatar changed. The id is a
  // number, and a number is compared by its value.
  const userId = user?.id

  useEffect(() => {
    // Nobody is logged in, so there is nothing to connect as. This also covers
    // logging out: userId becomes undefined, the cleanup below runs, and the
    // connection closes rather than staying open as the person who just left.
    if (!userId) return

    // Subscribed BEFORE connecting, so the first change is not missed.
    const unsubscribe = socket.subscribeStatus((next) => {
      setStatus(next)

      // Counted here rather than in socket.js, because it is a React idea --
      // "something changed that a screen should react to" -- and socket.js is
      // deliberately free of anything React.
      if (next === STATUS.OPEN) setOpenCount((count) => count + 1)
    })

    socket.connect()

    // --- two reasons to stop waiting and try immediately ---------------------
    //
    // Both matter far more on a phone than on a laptop, and both are the
    // difference between a chat that feels alive and one that seems to take
    // half a minute to wake up.

    // The network came back. The browser tells us this directly, and it is a
    // much better signal than a timer: there is no point retrying while there
    // is demonstrably no connection, and every point in retrying the instant
    // there is one.
    const handleOnline = () => socket.reconnectNow()

    // The tab, or the phone, came back to the foreground. Locking a phone
    // kills the connection; unlocking it should not mean sitting out a
    // thirty-second wait that was earned while the screen was off.
    //
    // visibilitychange fires for hidden as well, so the state is checked --
    // there is nothing to do when a tab is being hidden.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') socket.reconnectNow()
    }

    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)

    // WHAT REACT DOES WITH THIS RETURNED FUNCTION: it calls it when the
    // component goes away, and also before running this effect again. So
    // logging out closes the connection and removes both listeners, with no
    // chance of leaving either behind.
    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribe()
      socket.disconnect()
    }
  }, [userId, socket])

  // useMemo so this object is the SAME object between redraws unless something
  // in it actually changed.
  //
  // Without it, a brand-new object would be handed to every component using
  // useSocket() on every single redraw of this provider -- and since context
  // compares by identity, all of them would redraw too, whether or not
  // anything they care about had moved.
  const value = useMemo(
    () => ({
      status,
      // A plain true/false, because that is the question screens actually ask.
      // Nothing outside this file should have to remember the three status
      // names to work out whether messages are arriving.
      isConnected: status === STATUS.OPEN,
      openCount,
      // Passed straight through. It is already stable -- socket never changes
      // -- so it does not need wrapping in anything.
      subscribe: socket.subscribe,
    }),
    [status, openCount, socket],
  )

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

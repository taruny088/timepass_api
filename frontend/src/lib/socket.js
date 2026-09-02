import { BASE_URL, getToken } from '../api/client'

// The live connection, with no React in it at all.
//
// WHY THIS FILE HAS NO REACT. Everything here is awkward in the same way:
// timers, retries, a connection that dies without telling anybody. Mixing that
// with redraws and effects makes both halves harder to follow. So the whole
// mechanism lives here as plain JavaScript, and SocketContext.jsx is a thin
// layer that turns it into something components can use.
//
// WHAT IT ACTUALLY DOES, in one paragraph. It opens a WebSocket to the
// backend, proves who we are by sending the login token as the first message,
// then keeps that connection alive with a heartbeat and rebuilds it whenever it
// dies. Anything the server pushes gets handed to whoever subscribed.

// The three states a connection can be in. Exported because the interface
// shows them -- the "Reconnecting..." strip on the chat screen is this.
//
// Note there is no "authenticating" state. From the outside there are only two
// useful questions: can I receive messages right now, and if not, is it coming
// back?
export const STATUS = {
  CONNECTING: 'connecting',
  OPEN: 'open',
  CLOSED: 'closed',
}

// How often we say "still there?" to the server.
//
// Two jobs, and the second is the one people forget. It proves the connection
// is alive -- and it keeps the connection from being closed for being idle.
// Proxies and load balancers routinely drop a connection that has said nothing
// for a minute or two, which on a quiet chat would otherwise happen constantly.
//
// 25 seconds against the server's 70-second patience (IDLE_TIMEOUT_SECONDS in
// backend/app/ws.py) leaves room for two pings to go missing on a bad signal
// without the server giving up on a connection that is really fine.
const HEARTBEAT_MS = 25_000

// How long we wait for the "pong" before deciding the connection is dead.
//
// THIS IS THE ONLY WAY TO NOTICE A DEAD CONNECTION. A phone that goes into a
// tunnel, a laptop lid closing, wifi flipping to mobile data: none of those
// close the socket politely. It just goes quiet -- which looks exactly like
// nobody happening to be talking. Without this check the app would sit on a
// corpse, showing "connected", receiving nothing, forever.
const PONG_TIMEOUT_MS = 10_000

// How long to wait before each reconnection attempt, in order. The last value
// repeats forever.
//
// WHY IT GROWS. Something is wrong, and hammering it every second makes it
// worse -- especially here: Render's free backend sleeps after 15 minutes and
// takes up to a minute to wake, so the first several attempts are guaranteed
// to fail no matter what we do. Backing off means the app waits quietly during
// that minute instead of firing sixty pointless connections at a machine that
// is still booting.
//
// WHY IT STOPS GROWING at 30 seconds: past that it stops feeling like an app
// recovering and starts feeling like an app that has given up.
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000]

// Up to 30% extra, chosen at random, added to each wait.
//
// JITTER. If fifty people are using the app when the server restarts, all
// fifty browsers disconnect in the same second and, without this, all fifty
// retry in the same second -- and again, and again, in lockstep, each wave
// arriving together and making the next failure more likely. A random spread
// turns one crowd into a trickle. It matters far more than a line this small
// suggests.
const JITTER = 0.3

// The close code backend/app/ws.py sends when the token is no good. See the
// note in that file about the 4000-4999 range being ours to define.
const CLOSE_UNAUTHENTICATED = 4401

/** The ws:// address, worked out from the http:// one the API already uses. */
function socketUrl() {
  // A neat trick worth understanding rather than copying: replacing "http" at
  // the START of the address turns http into ws AND https into wss, because
  // the trailing "s" is simply left alone.
  //
  // That second case is not optional. A page served over https is FORBIDDEN by
  // the browser from opening a plain ws:// connection -- it is mixed content,
  // and it fails with a console error rather than a visible one. So on the
  // live site this must produce wss://, and it does, without a special case.
  const base = BASE_URL.replace(/^http/, 'ws').replace(/\/+$/, '')

  return `${base}/ws`
}

/**
 * Build one live connection.
 *
 * Returns the handful of things the rest of the app needs: start it, stop it,
 * listen to what arrives, and listen to whether it is up.
 *
 * A FACTORY FUNCTION RATHER THAN A CLASS. Everything it needs is kept in
 * ordinary variables that the inner functions can see, which is what a closure
 * is. No `this`, so no chance of `this` meaning something unexpected inside a
 * callback -- the single most common way this kind of code goes wrong.
 */
export function createSocket() {
  let websocket = null
  let status = STATUS.CLOSED

  // How many times in a row we have failed. Chooses the wait above, and resets
  // to zero the moment a connection succeeds.
  let attempt = 0

  // Set when the app deliberately closes the connection -- logging out, or
  // leaving the page. Without it, our own close would immediately trigger a
  // reconnection, and logging out would silently reopen a connection as the
  // person who just left.
  let closedOnPurpose = false

  // Set when the server refuses our token. Retrying is pointless: the token
  // will still be bad in two seconds, and again in four. Something has to
  // change first -- a fresh login -- and that calls connect() again anyway.
  let refused = false

  let heartbeatTimer = null
  let pongTimer = null
  let reconnectTimer = null

  // Everyone currently listening. SETS, not arrays: adding the same function
  // twice does nothing, and removing one is a single call rather than a search
  // for its position.
  const messageListeners = new Set()
  const statusListeners = new Set()

  function setStatus(next) {
    if (status === next) return // Nothing changed, so nobody needs telling.

    status = next
    statusListeners.forEach((listener) => listener(status))
  }

  // --- timers --------------------------------------------------------------

  function clearTimers() {
    clearInterval(heartbeatTimer)
    clearTimeout(pongTimer)
    heartbeatTimer = null
    pongTimer = null
  }

  function startHeartbeat() {
    clearTimers()

    heartbeatTimer = setInterval(() => {
      if (websocket?.readyState !== WebSocket.OPEN) return

      send({ type: 'ping' })

      // Start the stopwatch. The pong handler cancels this. If it never
      // arrives, the connection is dead and this fires.
      //
      // Only set if one is not already running, so a missed pong does not have
      // its deadline pushed back by the next ping.
      if (pongTimer === null) {
        pongTimer = setTimeout(() => {
          // close() here does NOT mean "give up". It means "stop pretending
          // this is alive": closing it ourselves triggers the onclose handler
          // below, which schedules a reconnection. Killing a dead connection is
          // how the app gets a live one.
          websocket?.close()
        }, PONG_TIMEOUT_MS)
      }
    }, HEARTBEAT_MS)
  }

  // --- sending -------------------------------------------------------------

  function send(payload) {
    // readyState is the browser's own view of the connection. Sending on one
    // that is not OPEN throws, and it is genuinely easy to hit: a ping timer
    // can fire in the moment between the connection dying and us noticing.
    if (websocket?.readyState !== WebSocket.OPEN) return

    websocket.send(JSON.stringify(payload))
  }

  // --- connecting ----------------------------------------------------------

  function connect() {
    // Already connected or on the way. Called again from several places --
    // the app starting, the tab becoming visible, the network coming back --
    // and each of those may be true at the same moment.
    //
    // This guard is also what makes React's StrictMode harmless. In
    // development it deliberately mounts, unmounts and remounts every
    // component to expose bugs, so connect() runs twice in a row. Without this
    // line that would open two sockets, and every message would arrive twice.
    if (websocket !== null) return

    const token = getToken()

    // No token means nobody is logged in, and an anonymous connection would
    // simply be refused by the server ten seconds later. Not an error -- just
    // nothing to do.
    if (!token) return

    closedOnPurpose = false
    refused = false
    setStatus(STATUS.CONNECTING)

    websocket = new WebSocket(socketUrl())

    websocket.onopen = () => {
      // THE HANDSHAKE. The browser's WebSocket API gives us no way to set an
      // Authorization header -- you get a URL and nothing else -- so the token
      // travels as the first message instead.
      //
      // The obvious alternative is ?token=... in the address, and it is a trap:
      // servers, proxies and hosting platforms log full addresses as a matter
      // of routine, so the token would be written in plain text into Render's
      // log for anyone with access to it. A message is not part of the
      // address, so it is not logged anywhere.
      //
      // Note the connection is NOT considered usable yet. The server has
      // accepted the socket but has not checked the token; until it says
      // "ready" this is still just an open pipe to nobody.
      send({ type: 'auth', token })
    }

    websocket.onmessage = (event) => {
      let payload

      try {
        payload = JSON.parse(event.data)
      } catch {
        // Not our JSON. Nothing sensible to do, and certainly nothing worth
        // crashing a chat screen over.
        return
      }

      // The heartbeat's answer. Handled here and never passed on -- no screen
      // in the app has any use for it.
      if (payload.type === 'pong') {
        clearTimeout(pongTimer)
        pongTimer = null
        return
      }

      // The server has checked the token and we are registered to receive.
      // THIS is the moment the connection becomes useful, which is why it is a
      // message rather than just `onopen`.
      if (payload.type === 'ready') {
        attempt = 0 // A success wipes out the history of failures.
        startHeartbeat()
        setStatus(STATUS.OPEN)
        return
      }

      messageListeners.forEach((listener) => listener(payload))
    }

    // onerror is deliberately ignored. The browser tells us almost nothing
    // here -- for security reasons the event carries no detail about what went
    // wrong -- and it is always followed by onclose, which is where the useful
    // information is. Handling both would mean doing the same work twice.
    websocket.onclose = (event) => {
      clearTimers()
      websocket = null

      // The token was refused. See `refused` above: retrying cannot help.
      if (event.code === CLOSE_UNAUTHENTICATED) {
        refused = true
        setStatus(STATUS.CLOSED)
        return
      }

      setStatus(STATUS.CLOSED)

      if (!closedOnPurpose) scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    // One pending attempt at a time. Two timers would double every following
    // attempt, and the app would end up opening connections in pairs.
    if (reconnectTimer !== null) return

    const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
    const wait = base + Math.random() * base * JITTER

    attempt += 1

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, wait)
  }

  /** Try again right now, abandoning any wait already in progress. */
  function reconnectNow() {
    if (closedOnPurpose || refused) return
    if (websocket !== null) return

    clearTimeout(reconnectTimer)
    reconnectTimer = null

    // Back to the shortest wait. Whatever we are reacting to -- the phone
    // waking, the wifi returning -- is a real reason to believe this attempt
    // will go better than the last one, so it should not be made to sit out a
    // thirty-second penalty earned while the network was genuinely down.
    attempt = 0
    connect()
  }

  function disconnect() {
    closedOnPurpose = true

    clearTimers()
    clearTimeout(reconnectTimer)
    reconnectTimer = null

    websocket?.close()
    websocket = null

    setStatus(STATUS.CLOSED)
  }

  // --- listening -----------------------------------------------------------

  // Both of these RETURN THE FUNCTION THAT UNDOES THEM, which is a pattern
  // worth recognising because React expects exactly it: whatever a useEffect
  // returns is what React calls when the component goes away. So a screen can
  // write
  //
  //     useEffect(() => subscribe(handleMessage), [])
  //
  // and its listener is removed automatically. A listener left behind after
  // its screen is gone is a leak that also fires code trying to update a
  // component that no longer exists.

  function subscribe(listener) {
    messageListeners.add(listener)
    return () => messageListeners.delete(listener)
  }

  function subscribeStatus(listener) {
    statusListeners.add(listener)
    return () => statusListeners.delete(listener)
  }

  return {
    connect,
    disconnect,
    reconnectNow,
    subscribe,
    subscribeStatus,
    getStatus: () => status,
  }
}

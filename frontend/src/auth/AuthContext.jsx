import { createContext, useContext, useEffect, useState } from 'react'
import api, { clearToken, getToken, saveToken } from '../api/client'

// CONTEXT solves one problem: many components need the same piece of
// information, and passing it down by hand through every level is miserable.
//
// Without context, to get the username into a button five levels deep, every
// component in between has to accept it and pass it along, even the ones that
// do not care. Context lets any component ask for the value directly.
//
// Auth is the textbook case: almost everything needs to know who is logged in.
const AuthContext = createContext(null)

// A custom HOOK. A hook is just a function whose name starts with "use" and
// which is called from inside a component. This one is a small convenience:
// components write useAuth() instead of useContext(AuthContext).
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return context
}

// A PROVIDER wraps part of the app and supplies the value to everything
// inside it. main.jsx wraps the whole app in this, so every page can call
// useAuth().
export function AuthProvider({ children }) {
  // STATE is data the screen is holding right now. useState gives back the
  // current value and a function to change it. The rule that matters:
  // calling the setter tells React to redraw everything that uses the value.
  // You never touch the page yourself.
  const [user, setUser] = useState(null)

  // Why a separate "loading" flag matters:
  //
  // When the page first opens we do not yet know whether the stored token is
  // still valid, because only the backend can say. During that moment user is
  // null -- which looks exactly like "logged out". Without this flag, the app
  // would bounce you to /login for a split second on every single refresh,
  // even when you are perfectly logged in.
  //
  // The function passed to useState runs once, when this component first
  // appears, to work out the starting value. We only start in the loading
  // state if there is actually a token worth checking. With no token we know
  // immediately that nobody is logged in, so there is nothing to wait for and
  // no wasted redraw.
  const [loading, setLoading] = useState(() => getToken() !== null)

  // useEffect runs code AFTER the screen has been drawn, for things that are
  // not drawing: fetching data, reading storage, timers.
  //
  // The [] at the end is the dependency list. Empty means "run this once,
  // when this component first appears", which is exactly what we want: check
  // the stored token once at startup.
  useEffect(() => {
    const token = getToken()

    // Nothing stored, so nobody is logged in. loading already started as
    // false in that case, so there is nothing to do at all.
    if (!token) {
      return
    }

    // A token exists -- but we do NOT trust it on its own. It may have
    // expired minutes ago, or the account may have been deleted. The only
    // thing that can say is the backend, so we ask.
    api
      .get('/auth/me')
      .then((response) => setUser(response.data))
      .catch(() => {
        // Rejected. The interceptor in client.js has already removed the dead
        // token; we just make sure our own state agrees.
        clearToken()
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    // Step 1: swap the email and password for a token.
    const response = await api.post('/auth/login', { email, password })
    saveToken(response.data.access_token)

    // Step 2: the token only carries a user id, so ask who that actually is.
    // This request already carries the new token, because the interceptor
    // reads it from storage and we just saved it there.
    const me = await api.get('/auth/me')
    setUser(me.data)
    return me.data
  }

  async function signup({ username, email, password, fullName }) {
    await api.post('/auth/signup', {
      username,
      email,
      password,
      // The backend field is full_name. Sending null rather than an empty
      // string matches what the API expects for "not provided".
      full_name: fullName || null,
    })

    // Signing up does not return a token, so we log in straight afterwards to
    // save the user typing their details a second time.
    return login(email, password)
  }

  function logout() {
    // Worth understanding: this is ALL logout can be.
    //
    // A JWT cannot be cancelled by the server. There is no list of issued
    // tokens to cross off, because the whole design is that no list is
    // needed. So logging out means the browser forgets its copy. If someone
    // had already copied the token, it keeps working until it expires --
    // which is why the 15 minute expiry is doing real work.
    clearToken()
    setUser(null)
  }

  const value = { user, loading, login, signup, logout }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

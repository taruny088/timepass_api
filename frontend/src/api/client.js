import axios from 'axios'

// One configured Axios instance that the whole app shares.
//
// PLAN.md picked Axios for exactly this reason: we set the login token up ONCE
// here, and every request in the app carries it automatically. The alternative
// is remembering to attach it by hand in twenty places, and forgetting one.

// Where the backend lives. import.meta.env is how Vite exposes settings.
//
// IMPORTANT: anything in a VITE_ variable is baked into the JavaScript that
// gets sent to the browser, so it is PUBLIC. Never put a password or secret
// key in one. An address like this is fine because it is public anyway.
//
// Note "baked in" literally: Vite substitutes the value when you BUILD, not
// when the page runs. Changing it later means rebuilding, not restarting.
const API_URL = import.meta.env.VITE_API_URL

// import.meta.env.DEV is true only while `npm run dev` is running. In a
// production build it is false.
//
// So during development a missing setting quietly falls back to localhost,
// which is convenient and correct. In a production build it is an error
// instead.
//
// Why refuse rather than fall back: without this, forgetting VITE_API_URL on
// the hosting platform produces a site that loads perfectly and where nothing
// works, because every request goes to "localhost" -- meaning the VISITOR'S
// own computer, which is not running your backend. That is the worst kind of
// bug, because it looks like the application code is broken. Failing at
// startup with a named cause is far kinder.
if (!API_URL && !import.meta.env.DEV) {
  throw new Error(
    'VITE_API_URL is not set. A production build needs it to know where the ' +
      'backend is. Set it before running "npm run build".',
  )
}

// EXPORTED since Phase 16c. The live connection in lib/socket.js has to reach
// the same backend, and works out its own ws:// address from this one. Working
// it out separately there would mean two places that both decide where the
// backend is, and one of them eventually being wrong.
export const BASE_URL = API_URL || 'http://localhost:8000'

// The one place the token is stored. Everything else goes through these three
// functions, so if we ever change where it lives, we change it here only.
const TOKEN_KEY = 'insta_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// An INTERCEPTOR is a function that runs automatically on every request or
// every response. This is the request one: it runs just before each request
// leaves the browser.
//
// If we have a token, it attaches the header the backend's get_current_user
// is looking for:
//
//     Authorization: Bearer eyJhbGciOi...
//
// This is the frontend half of the idea from Phase 3: the internet has no
// memory, so the proof must be re-sent with every single request.
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // PHASE 12: A FILE UPLOAD MUST NOT BE SENT AS JSON.
  //
  // The default Content-Type above is right for every request that sends an
  // object, and wrong for the one that sends a file.
  //
  // A multipart body is split into parts by a randomly generated separator
  // called a BOUNDARY, and the header has to name the exact boundary used in
  // the body:
  //
  //     Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryAbC123
  //
  // Only the browser knows that string, because it invents it while packing the
  // body. Leaving 'application/json' here would send a file with the wrong
  // header and no boundary at all, and the server would fail to unpack it --
  // with an error that reads like the file is corrupt rather than like a header
  // is wrong.
  //
  // Deleting the header is what tells axios to stand back and let the browser
  // fill it in. Do not try to set it by hand: you cannot know the boundary.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }

  return config
})

// The response interceptor runs on every reply.
//
// Its job here is to turn the many different ways a request can fail into one
// plain sentence a person can read, so no page has to work it out itself.
api.interceptors.response.use(
  // First function: the request succeeded. Pass it through untouched.
  (response) => response,

  // Second function: it failed.
  (error) => {
    // The token is dead (expired, or the account is gone). Throw it away so
    // the app stops pretending we are logged in.
    //
    // We skip this for the login endpoint itself: a 401 there means "wrong
    // password", which is a normal answer, not an expired session.
    const isLoginAttempt = error.config?.url?.includes('/auth/login')

    if (error.response?.status === 401 && !isLoginAttempt) {
      clearToken()
    }

    error.userMessage = readableMessage(error)
    return Promise.reject(error)
  },
)

function readableMessage(error) {
  // No response at all. The request never reached a server: the backend is not
  // running, it is asleep, or the computer is offline. This is the single most
  // common confusion when developing, because the browser console shows a
  // CORS-ish error that has nothing to do with the real cause.
  //
  // THE MESSAGE NAMES THE ADDRESS IT ACTUALLY TRIED, and that matters.
  //
  // It used to say "Is the backend running on port 8000?" as a fixed sentence.
  // On a laptop that is right. On the live site it is actively misleading --
  // the request went to Render, port 8000 has nothing to do with it, and the
  // message sends you to check a server on your own machine that was never
  // involved. That cost real time.
  //
  // An error message should say what actually happened. BASE_URL is the one
  // fact that separates the two cases, so it goes in the sentence.
  if (!error.response) {
    return `Cannot reach the server at ${BASE_URL}. It may be starting up, asleep, or not running.`
  }

  const { status, data } = error.response

  // FastAPI puts our own HTTPException messages in "detail" as a string.
  // That covers 401 "Incorrect email or password." and 409 "That username is
  // already taken." straight from Phase 3.
  if (typeof data?.detail === 'string') {
    return data.detail
  }

  // When Pydantic rejects a field, "detail" is a LIST of problems instead,
  // each naming the field it came from. We show the first one, tidied up.
  if (Array.isArray(data?.detail) && data.detail.length > 0) {
    const first = data.detail[0]
    const field = first.loc?.[first.loc.length - 1]
    return field ? `${field}: ${first.msg}` : first.msg
  }

  if (status >= 500) {
    return 'Something went wrong on the server. Please try again.'
  }

  return 'Something went wrong. Please try again.'
}

export default api

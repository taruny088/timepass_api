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
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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
  // running, or the computer is offline. This is the single most common
  // confusion when developing, because the browser console shows a CORS-ish
  // error that has nothing to do with the real cause.
  if (!error.response) {
    return 'Cannot reach the server. Is the backend running on port 8000?'
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

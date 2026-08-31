import { createContext, useContext, useEffect, useState } from 'react'

// Holds "light or dark" for the whole app, and remembers the choice.
//
// This is built the same way as AuthContext, for the same reason: many
// components need the same piece of information, and passing it down by hand
// through every level in between is miserable. A CONTEXT lets any component ask
// for the value directly, however deep it sits.
const ThemeContext = createContext(null)

// The key the choice is saved under in the browser. Written once, here, so a
// typo in one place cannot quietly break saving while loading still works.
const STORAGE_KEY = 'timepass-theme'

// A custom hook, exactly like useAuth. Components write useTheme() instead of
// useContext(ThemeContext).
export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === null) {
    throw new Error('useTheme must be used inside <ThemeProvider>')
  }
  return context
}

// Work out which theme to start in, the first time the app runs.
//
// The order matters, best answer first:
//   1. What this person chose last time, if they ever chose.
//   2. Otherwise, whatever their phone or laptop is set to.
//   3. Otherwise, light.
//
// Step 2 is worth doing. Someone whose phone is in dark mode expects a new app
// to open dark. Ignoring that and starting white is a small, avoidable
// unpleasantness.
function getInitialTheme() {
  // LOCAL STORAGE is a small box of text the browser keeps for our site, and
  // keeps after the tab is closed. Unlike the login token it is not secret and
  // not sent anywhere -- it never leaves this browser. A colour preference is
  // exactly the sort of thing it is for.
  //
  // Wrapped in try/catch because reading it can genuinely throw: a browser in
  // strict privacy mode, or with site data blocked, refuses. A blocked
  // preference should mean "start in light mode", not a blank crashed page.
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') {
      return saved
    }
  } catch {
    // Ignore and fall through to the device setting.
  }

  // matchMedia lets JavaScript ask the same question a CSS media query asks.
  // Here: "is this device set to dark mode?" .matches is true or false.
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }

  return 'light'
}

export function ThemeProvider({ children }) {
  // Passing a FUNCTION to useState instead of a value is deliberate.
  //
  // useState(getInitialTheme()) would call the function on every single redraw
  // and throw the answer away, reading localStorage over and over for nothing.
  // useState(getInitialTheme) hands React the function and lets it call it
  // once, on the very first render. This is called a lazy initialiser.
  const [theme, setTheme] = useState(getInitialTheme)

  // An EFFECT is for reaching outside React and touching the world -- here, the
  // <html> element and the browser's storage. React only ever redraws our own
  // components; anything beyond them has to be done in an effect.
  //
  // The [theme] at the end is the dependency list: run this again whenever
  // theme changes, and not otherwise.
  useEffect(() => {
    // document.documentElement is the <html> element -- the outermost one on
    // the page, above even <body>.
    //
    // This one line is the entire mechanism. index.css defined "dark:" to mean
    // "inside something with the class dark", so adding this class here makes
    // every token in the app switch at once. Nothing else has to know.
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    // Save it, so a refresh does not throw the choice away.
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Storage blocked. The theme still works for this visit; it just will not
      // be remembered. Not worth interrupting anyone over.
    }
  }, [theme])

  // The setter is given the PREVIOUS value rather than reading `theme`
  // directly. React batches state changes, so `theme` inside this function can
  // be a moment out of date. Asking for the previous value cannot be stale.
  function toggleTheme() {
    setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

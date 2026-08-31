import Button from './ui/Button'
import { Component } from 'react'

// Catches a crash anywhere inside the app and shows something useful.
//
// THE PROBLEM THIS SOLVES. If any component throws an error while drawing,
// React removes the ENTIRE page rather than showing a half-broken one. The
// user gets a blank white screen: no message, no explanation, no way back.
// It is the worst error state in the app, and it is invisible until it
// happens.
//
// PLAN.md phase 9 asks that when something fails, "the user sees a plain
// message explaining what happened, not a silent failure". A blank white
// page is the most silent failure there is.
//
// WHY THIS IS A CLASS, when every other component in this project is a
// function. React has no hook for catching errors -- componentDidCatch and
// getDerivedStateFromError only exist on classes. This is genuinely the one
// remaining reason to write one, and it is why you will still meet class
// components occasionally.
export default class ErrorBoundary extends Component {
  // state works the same way it does with useState: change it and React
  // redraws. The difference is only in how it is written.
  state = { hasError: false, message: '' }

  // Called by React when a child throws. Whatever this returns becomes the
  // new state, which is what switches us over to the fallback screen below.
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown error' }
  }

  // Called after the error, for reporting it. In a real product this is
  // where you would send the details to an error tracking service. Logging
  // to the console is enough here, and it means the real stack trace is
  // still available in devtools rather than being swallowed.
  componentDidCatch(error, info) {
    console.error('Caught by ErrorBoundary:', error, info)
  }

  handleReload = () => {
    // A full page reload rather than clearing the flag. Whatever went wrong
    // may have left state in a bad shape, and starting fresh is the honest
    // way out.
    window.location.href = '/'
  }

  render() {
    if (!this.state.hasError) {
      // Nothing went wrong: draw the app exactly as normal. This is the case
      // 99.9% of the time -- the boundary is invisible until it is needed.
      return this.props.children
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 text-center">
          <h1 className="text-h1 font-semibold text-ink">
            Something went wrong
          </h1>
          <p className="mt-2 text-body text-ink-muted">
            The page could not be displayed. This is a problem in the app, not
            something you did.
          </p>

          {/* The technical detail, shown small rather than hidden. If you are
              debugging your own app, having the message on screen saves
              opening devtools. */}
          <p className="mt-4 break-words rounded-control bg-hover px-3 py-2 text-left font-mono text-tiny text-ink-muted">
            {this.state.message}
          </p>

          <Button onClick={this.handleReload} className="mt-4">
            Go back home
          </Button>
        </div>
      </div>
    )
  }
}

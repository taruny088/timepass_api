import { Link } from 'react-router-dom'

// Shown for any address the app does not recognise.
//
// This used to be a silent redirect to the home page. That was worse than it
// looks: someone following a broken link, or mistyping /pofile/john, was
// quietly moved somewhere else with no explanation, and reasonably concluded
// they had clicked the wrong thing.
//
// PLAN.md phase 9: "when something fails, the user sees a plain message
// explaining what happened, not a silent failure."
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-5xl font-bold text-line">404</p>
        <h1 className="mt-2 text-xl font-bold text-ink">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          That address does not exist. It may have been a typo, or the page
          may have been deleted.
        </p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition hover:bg-accent-hover"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}

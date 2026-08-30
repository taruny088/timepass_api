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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-5xl font-bold text-slate-300">404</p>
        <h1 className="mt-2 text-xl font-bold text-slate-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          That address does not exist. It may have been a typo, or the page
          may have been deleted.
        </p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}

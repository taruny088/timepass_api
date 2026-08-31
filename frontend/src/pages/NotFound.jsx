import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'

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
        {/* 404 is the one deliberately oversized number in the app. It is not
            one of the six text sizes because it is not text you read -- it is a
            graphic, the way the icon on any other empty screen is. */}
        <p className="text-6xl font-semibold text-line">404</p>
        <h1 className="mt-2 text-h1 font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-body text-ink-muted">
          That address does not exist. It may have been a typo, or the page
          may have been deleted.
        </p>
        <Link to="/" className="mt-6 inline-block">
          <Button variant="primary">Go home</Button>
        </Link>
      </div>
    </div>
  )
}

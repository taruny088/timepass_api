import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

// The entry point. This is the first of our code that runs in the browser.
//
// index.html contains one empty <div id="root">. This line finds it and hands
// it to React, which fills it in and keeps it up to date from then on. That is
// why the site is called a single page application: there is genuinely one
// HTML page, and React swaps its contents.
//
// The nesting matters, outermost first:
//
//   ErrorBoundary catches a crash anywhere inside and shows a message
//                 instead of a blank white page. Outermost of our own
//                 components, so nothing escapes it.
//
//   StrictMode    development-only checks that warn about risky patterns.
//                 It deliberately runs some code twice to expose bugs, so do
//                 not be alarmed to see an effect fire twice in development.
//                 It does nothing in the built site.
//
//   BrowserRouter switches on routing for everything inside it. It must be
//                 outside anything that uses routes or <Navigate>.
//
//   AuthProvider  supplies "who is logged in" to everything inside it. It sits
//                 inside BrowserRouter because it will eventually need routing,
//                 and outside App because every page needs auth.
//
//   App           the route table itself.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

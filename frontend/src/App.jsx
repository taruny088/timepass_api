import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'

// The route table: which address shows which page.
//
// A ROUTE is an address inside the app. Without a router the whole site would
// be one single screen. With one, /login and /signup become real addresses
// that work with the browser's back button and can be bookmarked or shared.
//
// The important part: switching between these does NOT reload the page. React
// swaps the component out and the browser address bar is updated to match.
export default function App() {
  return (
    <Routes>
      {/* Anyone can reach these two. */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Wrapping the element in ProtectedRoute is what makes it private. */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />

      {/* Any address we do not recognise goes to the home page, which will
          itself bounce to /login if nobody is logged in. Without this, a typo
          in the address bar shows a blank white screen with no explanation. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import CreatePost from './pages/CreatePost'
import EditProfile from './pages/EditProfile'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import PostDetail from './pages/PostDetail'
import Profile from './pages/Profile'
import Search from './pages/Search'
import Signup from './pages/Signup'
import VerifyEmail from './pages/VerifyEmail'

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

      {/* PUBLIC, and that is the whole point of it. This is where the link in
          a confirmation email lands, and it is very often opened on a phone
          that has never logged in. Wrapping it in ProtectedRoute would bounce
          exactly the people it exists for to the login page.

          It is safe to leave open because the code in the address IS the
          proof -- it went to that one inbox and nowhere else. */}
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* Wrapping the element in ProtectedRoute is what makes it private. */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />

      {/* The three Phase 5 pages. All private, so all wrapped.

          The : in a path marks the part that changes. "/profile/:username"
          matches /profile/john_23 and /profile/mallory, and the page reads
          which one it got with useParams. One component, every user. */}
      <Route
        path="/create"
        element={
          <ProtectedRoute>
            <CreatePost />
          </ProtectedRoute>
        }
      />
      {/* Phase 13. Above /profile/:username on purpose.

          Routes are matched in order, and this one is a fixed address while
          that one is a pattern. They do not actually collide -- "/accounts/edit"
          has two segments and "/profile/:username" has two but a different
          first word -- but keeping the specific address above the pattern is
          the habit that stops a real collision later. */}
      <Route
        path="/accounts/edit"
        element={
          <ProtectedRoute>
            <EditProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/:username"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <Search />
          </ProtectedRoute>
        }
      />
      <Route
        path="/post/:postId"
        element={
          <ProtectedRoute>
            <PostDetail />
          </ProtectedRoute>
        }
      />

      {/* Any address we do not recognise.
          This used to redirect silently to the home page, which quietly moved
          people somewhere else with no explanation. Saying so is better. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

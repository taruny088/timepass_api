import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import CreatePost from './pages/CreatePost'
import Home from './pages/Home'
import Login from './pages/Login'
import PostDetail from './pages/PostDetail'
import Profile from './pages/Profile'
import Search from './pages/Search'
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

      {/* Any address we do not recognise goes to the home page, which will
          itself bounce to /login if nobody is logged in. Without this, a typo
          in the address bar shows a blank white screen with no explanation. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

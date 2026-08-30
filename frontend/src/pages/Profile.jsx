import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import FollowButton from '../components/FollowButton'
import Header from '../components/Header'
import PostImage from '../components/PostImage'

export default function Profile() {
  // useParams reads the changing part of the address.
  //
  // The route is "/profile/:username". For the address /profile/john_23 this
  // gives back { username: 'john_23' }. That is how ONE component serves
  // every user on the site instead of one page per person.
  const { username } = useParams()

  const { user: me } = useAuth()

  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])

  // The three states PLAN.md phase 9 asks every screen to handle. Building
  // them in now is much easier than retrofitting them later.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // ignore guards against a real bug called a race condition.
    //
    // If you click quickly from one profile to another, two requests are in
    // flight at once. They can come back in either order, so the SLOWER first
    // request could land last and overwrite the newer person's data. When the
    // username changes, React runs the cleanup function below, which flips
    // this flag, and the stale reply is thrown away instead of drawn.
    let ignore = false

    setLoading(true)
    setError('')

    // Promise.all runs both requests at the same time instead of waiting for
    // the first to finish before starting the second. Two round trips become
    // one wait.
    Promise.all([
      api.get(`/users/${username}`),
      api.get(`/users/${username}/posts`),
    ])
      .then(([profileResponse, postsResponse]) => {
        if (ignore) return
        setProfile(profileResponse.data)
        setPosts(postsResponse.data)
      })
      .catch((err) => {
        if (ignore) return
        setError(err.userMessage || 'Could not load this profile.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    // The CLEANUP function. React runs it before the effect runs again, and
    // when the component disappears.
    return () => {
      ignore = true
    }

    // [username] is the dependency list: run this again whenever the username
    // changes. In Phase 4 every list was [] meaning "once". With [] here,
    // clicking to another profile would leave the first person's photos on
    // screen forever.
  }, [username])

  // Is this my own profile? Decides whether delete buttons are drawn.
  //
  // Worth being clear: this only controls what is DRAWN. It is not security.
  // The backend checks ownership again on every delete request, because
  // anyone can send one without ever using a button.
  const isMe = me?.username === profile?.username

  // Called by FollowButton once the server has confirmed the change.
  //
  // Two things must move together: whether the button says "Following", and
  // the follower count beside it. Updating both here, in one place, means
  // they cannot disagree.
  function handleFollowChange(nowFollowing) {
    setProfile((current) => ({
      ...current,
      is_following: nowFollowing,
      // + 1 when we just followed, - 1 when we just unfollowed.
      follower_count: current.follower_count + (nowFollowing ? 1 : -1),
    }))
  }

  async function handleDelete(postId) {
    if (!window.confirm('Delete this post? This cannot be undone.')) return

    try {
      await api.delete(`/posts/${postId}`)

      // Remove it from the list on screen without re-fetching everything.
      // filter builds a NEW array without that post; React redraws because
      // the state changed.
      setPosts((current) => current.filter((post) => post.id !== postId))

      setProfile((current) => ({
        ...current,
        post_count: current.post_count - 1,
      }))
    } catch (err) {
      setError(err.userMessage || 'Could not delete that post.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* STATE 1: loading */}
        {loading && <p className="text-center text-slate-500">Loading...</p>}

        {/* STATE 2: something went wrong */}
        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-700">{error}</p>
            <Link to="/" className="mt-3 inline-block text-sm underline">
              Go home
            </Link>
          </div>
        )}

        {!loading && !error && profile && (
          <>
            <section className="flex items-center gap-5 rounded-xl border border-slate-200 bg-white p-6">
              {/* Show the avatar if there is one, otherwise a circle with the
                  first letter. {a ? b : c} is "this or that", as opposed to
                  {a && b} which is "show or nothing". */}
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.username}
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-300 text-2xl font-bold text-white">
                  {profile.username[0].toUpperCase()}
                </div>
              )}

              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  {profile.username}
                </h1>
                {profile.full_name && (
                  <p className="text-slate-600">{profile.full_name}</p>
                )}
                {profile.bio && (
                  <p className="mt-1 text-sm text-slate-500">{profile.bio}</p>
                )}
                {/* The three counts. All computed by the backend when
                    asked, never stored, so they cannot drift out of step
                    with reality.

                    follower_count = people who follow THIS user
                    following_count = people THIS user follows

                    Those two come from the same table read from opposite
                    directions, and mixing them up is the classic bug in
                    this part of the app. */}
                <div className="mt-2 flex gap-4 text-sm text-slate-700">
                  <span>
                    <span className="font-semibold">{profile.post_count}</span>{' '}
                    {profile.post_count === 1 ? 'post' : 'posts'}
                  </span>
                  <span>
                    <span className="font-semibold">
                      {profile.follower_count}
                    </span>{' '}
                    {profile.follower_count === 1 ? 'follower' : 'followers'}
                  </span>
                  <span>
                    <span className="font-semibold">
                      {profile.following_count}
                    </span>{' '}
                    following
                  </span>
                </div>

                {/* No follow button on your own profile. The backend also
                    refuses a self-follow with a 400, and the database
                    refuses it underneath that -- three layers, because
                    hiding a button stops nobody. */}
                {!isMe && (
                  <div className="mt-3">
                    <FollowButton
                      username={profile.username}
                      isFollowing={profile.is_following}
                      onChange={handleFollowChange}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* STATE 3: the person exists but has nothing yet. A clear
                message, not a blank space that looks broken. */}
            {posts.length === 0 ? (
              <p className="mt-8 text-center text-slate-500">
                {isMe
                  ? 'You have not posted anything yet.'
                  : `${profile.username} has not posted anything yet.`}
              </p>
            ) : (
              <div className="mt-6 grid grid-cols-3 gap-1 sm:gap-2">
                {/* .map turns a list of data into a list of things to draw.
                    key={post.id} tells React which item is which, so when one
                    is removed it updates just that square instead of redrawing
                    the whole grid. */}
                {posts.map((post) => (
                  <div key={post.id} className="group relative aspect-square">
                    <Link to={`/post/${post.id}`}>
                      <PostImage
                        src={post.image_url}
                        alt={post.caption || 'post'}
                        className="h-full w-full rounded object-cover"
                      />
                    </Link>

                    {/* Only drawn on your own posts. Decoration -- the real
                        protection is the 403 the backend returns. */}
                    {isMe && (
                      <button
                        onClick={() => handleDelete(post.id)}
                        title="Delete post"
                        className="absolute right-1 top-1 rounded bg-white/90 px-2 py-1 text-xs font-medium text-red-600 opacity-0 transition group-hover:opacity-100"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

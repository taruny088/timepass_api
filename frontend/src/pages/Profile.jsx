import { Image as ImageIcon, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import BottomNav from '../components/BottomNav'
import FollowButton from '../components/FollowButton'
import Header from '../components/Header'
import PostImage from '../components/PostImage'
import Avatar from '../components/ui/Avatar'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'

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
    <div className="min-h-screen bg-surface">
      <Header />

      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 md:pb-8">
        {/* STATE 1: loading */}
        {loading && <Spinner label="Loading profile" />}

        {/* STATE 2: something went wrong */}
        {!loading && error && (
          <div className="rounded-card border border-danger-line bg-danger-soft p-6 text-center">
            <p className="text-body text-danger">{error}</p>
            <Link to="/" className="mt-3 inline-block text-small underline">
              Go home
            </Link>
          </div>
        )}

        {!loading && !error && profile && (
          <>
            <Card as="section" className="flex items-center gap-4 p-4 sm:gap-6 sm:p-6">
              {/* The picture-or-first-letter block that used to be written out
                  here by hand. Avatar already carries the shrink-0 that stops a
                  round photo squashing into an oval beside long text. */}
              <Avatar
                src={profile.avatar_url}
                username={profile.username}
                size="lg"
              />

              {/* min-w-0 looks like it does nothing, and it is the whole fix.
               *
               * A flex item silently gets min-width:auto, which means "never
               * shrink below your own content". So a long username cannot wrap
               * -- it just pushes this column wider, and the page with it.
               * min-w-0 removes that floor, and the text wraps instead.
               *
               * shrink-0 on the avatar above is the other half. Without it the
               * flex row would take the space out of the picture instead, and
               * a round profile photo squashes into an oval.
               *
               * Search.jsx and CommentList.jsx already do this. Profile was the
               * one that got missed. */}
              <div className="min-w-0">
                <h1 className="text-h1 font-semibold break-words text-ink">
                  {profile.username}
                </h1>
                {profile.full_name && (
                  <p className="text-body text-ink-muted">{profile.full_name}</p>
                )}
                {profile.bio && (
                  <p className="mt-1 break-words text-small text-ink-muted">
                    {profile.bio}
                  </p>
                )}
                {/* The three counts. All computed by the backend when
                    asked, never stored, so they cannot drift out of step
                    with reality.

                    follower_count = people who follow THIS user
                    following_count = people THIS user follows

                    Those two come from the same table read from opposite
                    directions, and mixing them up is the classic bug in
                    this part of the app. */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small text-ink">
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
            </Card>

            {/* STATE 3: the person exists but has nothing yet. A clear
                message, not a blank space that looks broken. */}
            {posts.length === 0 ? (
              <EmptyState
                icon={ImageIcon}
                title={isMe ? 'No posts yet' : 'Nothing here yet'}
                message={
                  isMe
                    ? 'Your posts will appear here as a grid once you share one.'
                    : `${profile.username} has not posted anything yet.`
                }
              >
                {isMe && (
                  <Link to="/create">
                    <Button variant="primary">Share your first post</Button>
                  </Link>
                )}
              </EmptyState>
            ) : (
              <div className="mt-6 grid grid-cols-3 gap-1 sm:gap-2">
                {/* .map turns a list of data into a list of things to draw.
                    key={post.id} tells React which item is which, so when one
                    is removed it updates just that square instead of redrawing
                    the whole grid. */}
                {/* The square comes from PostImage now, not from here. Since
                    11c it reserves its own space before the photo arrives, so
                    setting the shape in two places would just be two rules
                    fighting over the same box. */}
                {posts.map((post) => (
                  <div key={post.id} className="group relative">
                    <Link to={`/post/${post.id}`} className="block">
                      <PostImage
                        src={post.image_url}
                        alt={post.caption || 'post'}
                        className="rounded-control"
                      />
                    </Link>

                    {/* Only drawn on your own posts. Decoration -- the real
                        protection is the 403 the backend returns. */}
                    {/* THE PHONE BUG THIS FIXES.
                     *
                     * This button used to be opacity-0 until group-hover. A
                     * touch screen has no hover, so on a phone there was
                     * genuinely no way to delete your own post -- the button
                     * existed and could never be revealed.
                     *
                     * Now it is always visible on a phone, and the hover reveal
                     * only applies from md: up, where a pointer exists. That is
                     * mobile first in practice: the phone case is the plain
                     * classes, and the desktop nicety is the addition. */}
                    {isMe && (
                      <button
                        onClick={() => handleDelete(post.id)}
                        aria-label="Delete post"
                        title="Delete post"
                        className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-control bg-surface/90 text-danger transition active:scale-90 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

import { Image as ImageIcon, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import AvatarUpload from '../components/AvatarUpload'
import BottomNav from '../components/BottomNav'
import FollowButton from '../components/FollowButton'
import Header from '../components/Header'
import PostImage from '../components/PostImage'
import Avatar from '../components/ui/Avatar'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import UserList from '../components/ui/UserList'

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

  // Which list the modal is showing: 'followers', 'following', or null for
  // closed. One piece of state rather than two booleans, because the two lists
  // can never both be open -- and two booleans would let them be.
  const [listKind, setListKind] = useState(null)

  const [listPeople, setListPeople] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')

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

  // Fetch the list only when one is actually asked for.
  //
  // This is why it is a separate effect rather than part of the profile load:
  // most visits never open either list, and fetching both up front would be
  // two requests nobody asked for on every single profile view.
  useEffect(() => {
    if (!listKind) return

    let ignore = false

    setListLoading(true)
    setListError('')
    // Clear the previous list immediately. Without this, switching from
    // followers to following shows the OLD names for a moment under the NEW
    // heading, which reads as a bug.
    setListPeople([])

    api
      .get(`/users/${username}/${listKind}`)
      .then((response) => {
        if (!ignore) setListPeople(response.data)
      })
      .catch((err) => {
        if (!ignore) setListError(err.userMessage || 'Could not load that list.')
      })
      .finally(() => {
        if (!ignore) setListLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [listKind, username])

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
            {/* THE PROFILE HEADER, REBUILT FROM THE PHASE 11 COMPARISON.
             *
             * What was here before put the username, the display name, the bio,
             * the three counts AND the button all into one narrow column beside
             * an 80px avatar. On a 375px phone that column is about 250px wide,
             * so a bio of any length wrapped into a thin ragged strip.
             *
             * Instagram's phone layout is a different shape entirely, and the
             * reason is the bio:
             *
             *     username
             *     [avatar]   posts   followers   following
             *     display name
             *     bio                          <- the FULL width of the screen
             *     [ Edit profile              ] <- full width too
             *
             * Only the three counts sit beside the picture. Everything made of
             * sentences gets the whole width, because sentences need it.
             */}
            <Card as="section" className="p-4 sm:p-6">
              <h1 className="text-h1 font-semibold break-words text-ink">
                {profile.username}
              </h1>

              <div className="mt-4 flex items-center gap-4 sm:gap-8">
                {/* Your own photo is a button; everyone else's is just a
                    picture. isMe decides which is drawn, and the backend decides
                    for real -- /users/me/avatar can only ever change the account
                    the token belongs to, so there is no way to aim it at someone
                    else however the page is edited in a browser.

                    Both the camera button and the upload live in AvatarUpload,
                    because the edit page needs exactly the same thing and two
                    copies drift apart the moment either is touched. */}
                {isMe ? (
                  <AvatarUpload
                    src={profile.avatar_url}
                    username={profile.username}
                    size="lg"
                    onError={setError}
                    // This page holds its own copy of the profile, separate from
                    // the shared user in AuthContext. AvatarUpload refreshes that
                    // shared one; this updates ours, so the photo on screen here
                    // changes at the same moment as the one in the header.
                    onUploaded={(me) =>
                      setProfile((current) => ({
                        ...current,
                        avatar_url: me.avatar_url,
                      }))
                    }
                  />
                ) : (
                  <Avatar
                    src={profile.avatar_url}
                    username={profile.username}
                    size="lg"
                  />
                )}

                {/* The three counts, number above word, spread across whatever
                    room is left. All computed by the backend when asked, never
                    stored, so they cannot drift out of step with reality.

                    follower_count  = people who follow THIS user
                    following_count = people THIS user follows

                    Those two come from the same table read from opposite
                    directions, and mixing them up is the classic bug in this
                    part of the app. */}
                <div className="flex flex-1 justify-around text-center text-ink">
                  <div>
                    <span className="block text-h2 font-semibold">
                      {profile.post_count}
                    </span>
                    <span className="text-small text-ink-muted">
                      {profile.post_count === 1 ? 'post' : 'posts'}
                    </span>
                  </div>

                  {/* These two are BUTTONS, not text. A count you can open is a
                      control, and a control has to say so -- it needs a hover
                      state, a press state and a thumb-sized target, or nobody
                      discovers it is tappable.

                      The post count stays plain text because there is nothing
                      to open: the grid is already below. */}
                  <button
                    onClick={() => setListKind('followers')}
                    className="rounded-control px-2 transition hover:bg-hover active:opacity-70"
                  >
                    <span className="block text-h2 font-semibold">
                      {profile.follower_count}
                    </span>
                    <span className="text-small text-ink-muted">
                      {profile.follower_count === 1 ? 'follower' : 'followers'}
                    </span>
                  </button>

                  <button
                    onClick={() => setListKind('following')}
                    className="rounded-control px-2 transition hover:bg-hover active:opacity-70"
                  >
                    <span className="block text-h2 font-semibold">
                      {profile.following_count}
                    </span>
                    <span className="text-small text-ink-muted">following</span>
                  </button>
                </div>
              </div>

              {/* Name and bio, across the full width. break-words so a long
                  unbroken string -- a pasted link, say -- wraps instead of
                  pushing the page sideways. */}
              {(profile.full_name || profile.bio) && (
                <div className="mt-4">
                  {profile.full_name && (
                    <p className="text-strong font-semibold break-words text-ink">
                      {profile.full_name}
                    </p>
                  )}
                  {profile.bio && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-small text-ink">
                      {profile.bio}
                    </p>
                  )}
                </div>
              )}

              {/* One button, full width on a phone, sized to its text from sm:
                  up. Instagram does exactly this, and it is not decoration: a
                  full-width target is the easiest thing in the world to hit
                  one-handed.

                  No follow button on your own profile. The backend also refuses
                  a self-follow with a 400, and the database refuses it
                  underneath that -- three layers, because hiding a button stops
                  nobody. */}
              <div className="mt-4">
                {isMe ? (
                  <Link to="/accounts/edit" className="block sm:inline-block">
                    <Button variant="secondary" fullWidth className="sm:w-auto">
                      Edit profile
                    </Button>
                  </Link>
                ) : (
                  <FollowButton
                    username={profile.username}
                    isFollowing={profile.is_following}
                    onChange={handleFollowChange}
                    fullWidth
                  />
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
              /* Edge to edge on a phone, like Instagram's. -mx-4 cancels the
                 page's own px-4 so the squares reach both edges, and sm:mx-0
                 hands it back once there is width to spare.

                 gap-px is the hairline Instagram leaves between squares. gap-1
                 was 4px, which reads as a deliberate gap rather than a seam. */
              <div className="-mx-4 mt-6 grid grid-cols-3 gap-px sm:mx-0 sm:gap-1">
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
                        src={post.media[0].url}
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
        {/* The modal sits at the end of the page rather than next to the
            counts that open it. It is position:fixed, so where it appears on
            screen has nothing to do with where it is written -- and keeping it
            out of the profile card avoids inheriting that card's padding and
            overflow rules. */}
        <Modal
          open={listKind !== null}
          onClose={() => setListKind(null)}
          title={listKind === 'followers' ? 'Followers' : 'Following'}
        >
          <UserList
            people={listPeople}
            loading={listLoading}
            error={listError}
            emptyIcon={Users}
            emptyTitle={
              listKind === 'followers' ? 'No followers yet' : 'Not following anyone'
            }
            emptyMessage={
              listKind === 'followers'
                ? `Nobody follows ${profile?.username} yet.`
                : `${profile?.username} is not following anyone yet.`
            }
            // Close as you navigate. Without this the dialog stays open on top
            // of the profile you just asked to see.
            onNavigate={() => setListKind(null)}
          />
        </Modal>
      </main>

      <BottomNav />
    </div>
  )
}

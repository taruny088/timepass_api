import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import AvatarUpload from '../components/AvatarUpload'
import BottomNav from '../components/BottomNav'
import Header from '../components/Header'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'

// Phase 13, step 1: change your own display name, bio and photo.
//
// The limits match the columns in models.py -- String(100) and String(200).
// Three places now know these numbers: the database, the schema and this file.
// They fail very differently, which is the point of having all three. This one
// stops you typing a 201st character at all. The schema returns a polite
// message if a request gets past the browser. The database is the last word.
const MAX_NAME = 100
const MAX_BIO = 200

export default function EditProfile() {
  const { user, loading, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')

  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // THE BOXES START EMPTY AND ARE FILLED IN WHEN THE USER ARRIVES.
  //
  // On a refresh this page draws before AuthContext has finished asking
  // /auth/me who we are, so `user` is null for a moment. useState only uses its
  // starting value once, on the very first draw, so setting the boxes from
  // `user` there would leave them permanently blank. This effect runs again
  // when `user` arrives and fills them in then.
  //
  // ?? '' rather than the value alone: full_name and bio are null for someone
  // who has never set them, and putting null into a text box makes React warn
  // that the input has switched from controlled to uncontrolled.
  useEffect(() => {
    if (!user) return
    setFullName(user.full_name ?? '')
    setBio(user.bio ?? '')
  }, [user])

  async function handleSubmit(event) {
    // Without this the browser does what forms did before JavaScript: reloads
    // the whole page and throws away everything on screen.
    event.preventDefault()

    setError('')
    setSaved(false)
    setSaving(true)

    try {
      // PATCH, not PUT or POST. PATCH means "change only what I send".
      //
      // Both fields are sent every time here because the form holds both, so
      // the distinction does not bite today. It will in step 3, when the same
      // idea is used for settings this page does not show -- and an endpoint
      // that only ever changes what it was given is the one that stays safe as
      // the form grows.
      //
      // An emptied box sends "", which the backend turns into nothing at all,
      // so clearing your bio really does clear it.
      await api.patch('/users/me', {
        full_name: fullName,
        bio: bio,
      })

      // Ask the server who we are again rather than trusting what we just
      // typed. The header, the bottom bar and every avatar in the app draw from
      // that shared copy, so without this the old name stays on screen until
      // the next reload -- nothing looks broken, it just quietly shows the
      // wrong thing.
      await refreshUser()

      setSaved(true)
    } catch (err) {
      setError(err.userMessage || 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  // ProtectedRoute already guarantees somebody is logged in by the time this
  // page is drawn, so this is only the brief moment where we are still asking
  // the backend to confirm the stored token.
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-surface">
        <Header />
        <main className="mx-auto max-w-lg px-4 py-6">
          <Spinner label="Loading your profile" />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <main className="mx-auto max-w-lg px-4 py-6 pb-24 md:pb-8">
        <h1 className="mb-4 text-h1 font-semibold text-ink">Edit profile</h1>

        <Card as="form" onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* role="alert" makes a screen reader announce this the moment it
              appears. Without it the message is drawn silently and someone not
              looking at that part of the screen never learns the save failed. */}
          {error && (
            <p
              role="alert"
              className="rounded-control bg-danger-soft px-3 py-2 text-small text-danger"
            >
              {error}
            </p>
          )}

          {saved && (
            <p
              role="status"
              className="rounded-control bg-hover px-3 py-2 text-small text-ink"
            >
              Profile saved.
            </p>
          )}

          {/* The photo, and the handle it belongs to.
              The username is shown but not editable: it is in the address of
              every profile page and every link anyone has shared. Changing it
              is a separate job with real consequences, and PLAN2 does not ask
              for it in this phase. */}
          <div className="flex items-center gap-4">
            <AvatarUpload
              src={user.avatar_url}
              username={user.username}
              onError={setError}
            />
            <div className="min-w-0">
              <p className="text-strong font-semibold break-words text-ink">
                {user.username}
              </p>
              <p className="text-tiny text-ink-muted">
                Tap the camera to change your photo
              </p>
            </div>
          </div>

          <Input
            label="Display name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={MAX_NAME}
            placeholder="Your name"
            hint="Shown on your profile. Your username stays the same."
          />

          <div>
            <Input
              label="Bio"
              multiline
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={MAX_BIO}
              placeholder="Say something about yourself"
            />
            <p className="mt-1 text-right text-tiny text-ink-muted">
              {bio.length} / {MAX_BIO}
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="submit" fullWidth disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              // Straight to the profile rather than navigate(-1). Back would
              // return wherever you came from, which after a save is usually
              // not where you want to end up.
              onClick={() => navigate(`/profile/${user.username}`)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </Card>
      </main>

      <BottomNav />
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import BottomNav from '../components/BottomNav'
import Header from '../components/Header'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'

// Changing your password while logged in.
//
// The current password is asked for, and that is the point of the screen
// rather than a formality. Being logged in is not the same as owning the
// account: a borrowed unlocked laptop would otherwise be enough to set a new
// password and lock the real owner out permanently.
//
// The backend checks it again, which is where the rule actually lives. This
// form only decides what is drawn.
const MIN_PASSWORD = 8

export default function ChangePassword() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaved(false)

    // CONFIRM-PASSWORD IS CHECKED HERE AND NOWHERE ELSE, and that is correct.
    //
    // It is not a security rule -- it protects against a typo in something you
    // cannot see while typing it, and a typo is not an attack. Sending it to
    // the server would mean the server carrying a field that exists purely to
    // be compared with another one, which is the browser's job.
    //
    // Everything that IS a rule -- the current password, the length, the bcrypt
    // byte limit -- is checked by the backend, because anything in a browser
    // can be switched off by whoever is running the browser.
    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.')
      return
    }

    setSaving(true)

    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })

      setSaved(true)

      // Clear all three boxes. A password left sitting in a form is a password
      // sitting in the browser's memory, and on a shared computer the next
      // person can reveal it with the browser's own developer tools.
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.userMessage || 'Could not change your password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <main className="mx-auto max-w-lg px-4 py-6 pb-24 md:pb-8">
        <h1 className="mb-4 text-h1 font-semibold text-ink">Change password</h1>

        <Card as="form" onSubmit={handleSubmit} className="space-y-4 p-6">
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
              Your password has been changed.
            </p>
          )}

          {/* type="password" on all three. It hides the characters, and it also
              tells a password manager what these boxes are for, which is what
              makes "save this password?" appear at the right moment. */}
          <Input
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            // autoComplete is a real instruction to the browser and the two
            // values are not interchangeable. current-password offers the
            // stored password; new-password stops it doing that and offers to
            // generate one instead. Get them the wrong way round and a password
            // manager quietly fills the new box with the old password.
            autoComplete="current-password"
            required
          />

          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            hint={`At least ${MIN_PASSWORD} characters.`}
            required
          />

          <Input
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          <div className="flex gap-2">
            <Button type="submit" fullWidth disabled={saving}>
              {saving ? 'Changing...' : 'Change password'}
            </Button>
            <Button
              type="button"
              variant="secondary"
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

import { useState } from 'react'
import api from '../api/client'
import Button from './ui/Button'

// The follow / unfollow button.
//
// It does NOT own the answer to "am I following this person?". The profile
// page owns that, because the follower count sitting next to the button has
// to change at the same moment. If the button kept its own private copy, the
// two could disagree and the screen would contradict itself.
//
// So the button receives the current answer as `isFollowing`, and reports
// changes back up with `onChange`. The only thing it owns is whether a
// request is in flight right now.
//
// Passing values down and reporting changes up is the normal way React
// components talk to each other.
export default function FollowButton({ username, isFollowing, onChange }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setError('')
    setSubmitting(true)

    try {
      if (isFollowing) {
        await api.delete(`/users/${username}/follow`)
      } else {
        await api.post(`/users/${username}/follow`)
      }

      // Only tell the parent AFTER the server has confirmed it.
      //
      // The alternative is to flip the button the instant it is clicked and
      // quietly undo it if the request fails. That feels faster, and it means
      // the screen briefly shows something that might not be true. PLAN.md
      // introduces that trade-off in Phase 8 for the like button, so this
      // stays honest and simple until then.
      onChange(!isFollowing)
    } catch (err) {
      setError(err.userMessage || 'Could not update follow.')
    } finally {
      // Runs whether it worked or failed, so the button can never get stuck
      // saying "..." forever.
      setSubmitting(false)
    }
  }

  return (
    <div>
      {/* The two states are now just two variants of the same shared Button.
          Following is "secondary" -- a real action, but not the one you came
          for -- and Follow is "primary". Before this, the two states were two
          separately hand-written class strings that had drifted apart. */}
      <Button
        variant={isFollowing ? 'secondary' : 'primary'}
        onClick={handleClick}
        disabled={submitting}
      >
        {submitting ? '...' : isFollowing ? 'Following' : 'Follow'}
      </Button>

      {error && <p className="mt-1 text-tiny text-danger">{error}</p>}
    </div>
  )
}

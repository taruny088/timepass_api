import { Camera, Loader2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import Avatar from './ui/Avatar'

// Your own profile picture, with the camera button that replaces it.
//
// WHY THIS IS A COMPONENT AND NOT COPIED TWICE.
//
// Phase 12 wrote this straight into Profile.jsx. Phase 13 adds an edit page,
// which needs exactly the same thing. Copying it would mean two places that
// each have to remember the size limit, the "clear the input" trick, the
// spinner and the two-copies problem below -- and the second one drifts out of
// step with the first the moment either is touched. Design rules in CLAUDE.md:
// build shared pieces once and reuse them.
//
// The backend is what actually protects this. /users/me/avatar can only ever
// change the account the token belongs to, so this component cannot be aimed
// at somebody else even by someone editing the page in their browser.

// The same limit the backend enforces in media.py. Checked here so the answer
// is instant, and checked there because anything in a browser can be bypassed.
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = 'image/jpeg,image/png,image/gif,image/webp'

export default function AvatarUpload({
  src,
  username,
  size = 'lg',
  // Called with the fresh user record once the upload has succeeded, so the
  // page around this can update its own copy of the photo. Optional: some
  // callers only care that the shared user in AuthContext was refreshed.
  onUploaded,
  // Called with a plain sentence when something goes wrong. The error is shown
  // by the page, not by this component, because each page already has its own
  // place for one and two error messages on screen is worse than none.
  onError,
}) {
  const { refreshUser } = useAuth()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  // The id has to be generated, not written in, for the same reason as
  // Input.jsx: htmlFor on the label must match id on the input, every id on a
  // page must be unique, and the old code hard-coded "avatar". Two of these on
  // one screen would silently point the label at the wrong box. useId cannot
  // collide.
  const id = useId()

  async function handleChange(event) {
    const file = event.target.files?.[0]

    // Clear the input immediately, whatever happens next. Without this,
    // choosing the same file twice in a row does nothing at all: the value has
    // not changed, so the browser fires no event. It also lets someone pick the
    // file again after fixing whatever was wrong with it.
    event.target.value = ''
    if (!file) return

    if (file.size > MAX_BYTES) {
      onError?.(
        `That photo is ${Math.round(file.size / (1024 * 1024))} MB. The limit is 5 MB.`,
      )
      return
    }

    onError?.('')
    setUploading(true)

    try {
      // FormData is how a browser sends a real file. A file is not text, so it
      // cannot travel inside JSON -- FormData packs it into a different kind of
      // request body with separators between the parts.
      const form = new FormData()
      form.append('image', file)

      const response = await api.post('/users/me/avatar', form)

      // TWO THINGS HOLD THE SAME PICTURE, AND BOTH MUST MOVE.
      //
      // The page around this draws one copy. `user` in AuthContext is what the
      // header and the bottom bar draw. They are separate copies of the same
      // person, so updating one and not the other leaves the new photo on the
      // profile and the old one still in the header -- which looks like the
      // upload half-worked, and is harder to explain than a clean failure.
      await refreshUser()
      onUploaded?.(response.data)
    } catch (err) {
      onError?.(err.userMessage || 'Could not update your photo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="relative shrink-0">
      <Avatar src={src} username={username} size={size} />

      {/* The real file input is hidden and driven by the button below.
       *
       * A browser's own file input cannot be styled -- every browser draws its
       * own and none of them match this app. So it is hidden with sr-only
       * rather than display:none, because a genuinely hidden input is skipped
       * by the keyboard and by screen readers, and the picker would become
       * unreachable for anyone not using a mouse. */}
      <label htmlFor={id} className="sr-only">
        Change your profile photo
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        // accept only filters what the file browser offers by default. It is a
        // convenience, not a check -- the real check reads the file's first
        // bytes on the server, because a filename is a claim and anyone can
        // rename anything.
        accept={ACCEPTED}
        onChange={handleChange}
        disabled={uploading}
        className="sr-only"
      />

      <button
        type="button"
        // A ref rather than document.getElementById, which is what this used to
        // do. Reaching into the whole document to find an element React itself
        // drew works until there are two of them, and then it finds the wrong
        // one. A ref points at this component's own input and nothing else.
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Change your profile photo"
        title="Change your profile photo"
        className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-accent text-on-accent transition active:scale-90 hover:bg-accent-hover disabled:bg-accent-soft"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Camera className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}

import { ImagePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import BottomNav from '../components/BottomNav'
import Header from '../components/Header'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'

// Phase 12: choose a photo from the device, instead of pasting a link.
//
// The link box is gone. It was never usable by a real person -- nobody has a
// public web address for the picture they just took.

// The same limits the backend enforces. Checked here so the answer is instant,
// and checked there because anything running in a browser can be bypassed.
// Frontend validation is for speed; backend validation is for correctness.
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = 'image/jpeg,image/png,image/gif,image/webp'

export default function CreatePost() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 0 to 100 while the photo is going up. Photos take real time on a phone
  // connection, and a button that just says "Posting..." for twenty seconds
  // looks stuck.
  const [progress, setProgress] = useState(0)

  const fileInputRef = useRef(null)

  // THE PREVIEW, AND WHY IT MUST BE CLEANED UP.
  //
  // URL.createObjectURL makes a temporary address pointing at a file already on
  // the device, so the preview shows instantly without uploading anything.
  //
  // The browser cannot know when you have finished with that address, so it
  // holds the whole file in memory until told otherwise. Choosing ten photos
  // without revoking would leave ten files sitting there. revokeObjectURL is
  // what releases it, and the cleanup below runs it whenever the file changes
  // or the page closes.
  useEffect(() => {
    if (!file) {
      setPreviewUrl('')
      return
    }

    const url = URL.createObjectURL(file)
    setPreviewUrl(url)

    return () => URL.revokeObjectURL(url)
  }, [file])

  function handleFileChange(event) {
    setError('')

    const chosen = event.target.files?.[0]
    if (!chosen) return

    if (chosen.size > MAX_BYTES) {
      setError(
        `That image is ${Math.round(chosen.size / (1024 * 1024))} MB. The limit is 5 MB.`,
      )
      // Clear the input, so the same file can be chosen again after resizing
      // it. Without this the browser sees no change and fires nothing.
      event.target.value = ''
      return
    }

    setFile(chosen)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!file) {
      setError('Choose a photo first.')
      return
    }

    setSubmitting(true)
    setProgress(0)

    try {
      // FormData is how a browser sends a real file. A file is not text, so it
      // cannot travel in JSON -- FormData packs the file and the other fields
      // into one multipart body with separators between them.
      //
      // Deliberately NOT setting a Content-Type header. The browser has to set
      // it, because multipart requires a randomly generated boundary string in
      // the header that must match the separators in the body. Set it by hand
      // and you get an error that looks like the file is corrupt.
      const form = new FormData()
      form.append('image', file)
      if (caption) form.append('caption', caption)

      // Note what is NOT sent: who the author is. The backend takes that from
      // the token. If the browser could choose it, anyone could post as anyone
      // else.
      await api.post('/posts', form, {
        // axios reports how much has gone up so far. event.total can be
        // missing on some connections, hence the guard -- without it the bar
        // would show NaN.
        onUploadProgress: (event) => {
          if (event.total) {
            setProgress(Math.round((event.loaded * 100) / event.total))
          }
        },
      })

      navigate(`/profile/${user.username}`)
    } catch (err) {
      setError(err.userMessage || 'Could not create the post.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <main className="mx-auto max-w-lg px-4 py-6 pb-24 md:pb-8">
        <h1 className="mb-4 text-h1 font-semibold text-ink">New post</h1>

        <Card as="form" onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <p
              role="alert"
              className="rounded-control bg-danger-soft px-3 py-2 text-small text-danger"
            >
              {error}
            </p>
          )}

          {/* THE FILE INPUT IS HIDDEN, AND THE LABEL IS THE BUTTON.
           *
           * A browser's own file input cannot be styled -- every browser draws
           * its own, and they all look different and none of them match this
           * app. The standard answer is to hide the real input and put a label
           * in front of it: clicking a label activates the input it points at,
           * so this behaves exactly like the real thing, keyboard included.
           *
           * sr-only rather than display:none, because a genuinely hidden input
           * is skipped by the keyboard and by screen readers, which would make
           * the picker unreachable for anyone not using a mouse. */}
          <div>
            <label htmlFor="photo" className="sr-only">
              Choose a photo
            </label>
            <input
              ref={fileInputRef}
              id="photo"
              type="file"
              // accept filters what the file browser offers by default. It is a
              // convenience, not a check -- the real check reads the file's
              // first bytes on the server, because a filename is a claim and
              // anyone can rename anything.
              accept={ACCEPTED}
              // capture is what makes a phone offer the camera as well as the
              // gallery.
              capture="environment"
              onChange={handleFileChange}
              className="sr-only"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-control border-2 border-dashed border-line px-4 py-8 text-ink-muted transition active:scale-[0.99] hover:border-ink-muted hover:bg-hover"
            >
              <ImagePlus className="h-8 w-8" aria-hidden="true" />
              <span className="text-body font-semibold">
                {file ? 'Choose a different photo' : 'Choose a photo'}
              </span>
              <span className="text-tiny">JPEG, PNG, GIF or WebP, up to 5 MB</span>
            </button>
          </div>

          {previewUrl && (
            <div className="overflow-hidden rounded-control border border-line">
              {/* aspect-square to match how it will actually appear in the
                  feed, so what you see here is what you get. */}
              <img
                src={previewUrl}
                alt="The photo you chose"
                className="aspect-square w-full object-cover"
              />
            </div>
          )}

          <div>
            <Input
              label="Caption (optional)"
              multiline
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={2200}
              rows={3}
              placeholder="Say something about it"
            />
            <p className="mt-1 text-right text-tiny text-ink-muted">
              {caption.length} / 2200
            </p>
          </div>

          {/* The progress bar, drawn only while something is actually going up.
              A photo on a phone connection takes real time, and a button that
              says "Posting..." for twenty seconds with nothing moving looks
              broken rather than busy. */}
          {submitting && (
            <div>
              <div
                className="h-1 w-full overflow-hidden rounded-full bg-hover"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
              >
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-center text-tiny text-ink-muted">
                {/* Once it reaches 100 the file has left this device, but the
                    server is still uploading it to Cloudinary. Saying so is
                    more honest than a bar that sits full doing nothing. */}
                {progress < 100 ? `Uploading ${progress}%` : 'Almost there...'}
              </p>
            </div>
          )}

          <Button type="submit" fullWidth disabled={submitting || !file}>
            {submitting ? 'Posting...' : 'Post'}
          </Button>
        </Card>
      </main>

      <BottomNav />
    </div>
  )
}

import { ImagePlus, X } from 'lucide-react'
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

// Instagram's own limit, matching MAX_PHOTOS_PER_POST in backend/app/posts.py.
// Both check it: this one so the answer is instant, that one because anything
// running in a browser can be bypassed.
const MAX_PHOTOS = 10

export default function CreatePost() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // An ARRAY now, not a single file, and the order of it is the order the
  // photos will appear in the post.
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState([])
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
    // One temporary address per chosen file.
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)

    // Release every one of them when the selection changes or the page closes.
    //
    // This matters more now than it did with a single photo. Ten files at 4 MB
    // each is 40 MB the browser holds on to until told otherwise, and choosing
    // a different ten leaves the first forty megabytes stranded. revokeObjectURL
    // is the only thing that frees them.
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [files])

  function handleFileChange(event) {
    setError('')

    // event.target.files is a FileList, not an array -- it has a length and can
    // be indexed, and has none of the methods you would expect. Array.from
    // turns it into a real array so .map and .filter work.
    const chosen = Array.from(event.target.files ?? [])
    if (chosen.length === 0) return

    // Clear the input straight away, whatever happens next.
    //
    // Without this, choosing the same file twice in a row does nothing: the
    // input's value has not changed, so no event fires. It also lets someone
    // re-choose a file after fixing the reason it was rejected.
    event.target.value = ''

    const tooBig = chosen.find((f) => f.size > MAX_BYTES)
    if (tooBig) {
      // Naming the file matters when ten were chosen. "One of them is too
      // large" leaves you opening files one at a time to find out which.
      setError(
        `${tooBig.name} is ${Math.round(tooBig.size / (1024 * 1024))} MB. The limit is 5 MB each.`,
      )
      return
    }

    // Added to what is already chosen, rather than replacing it, so photos can
    // be picked in more than one go.
    const combined = [...files, ...chosen]

    if (combined.length > MAX_PHOTOS) {
      setError(
        `A post can hold at most ${MAX_PHOTOS} photos. You have ${files.length} and chose ${chosen.length} more.`,
      )
      return
    }

    setFiles(combined)
  }

  function removeFile(indexToRemove) {
    setError('')
    // filter builds a NEW array without that photo. The remaining ones keep
    // their order, which is what the post will use.
    setFiles((current) => current.filter((_, i) => i !== indexToRemove))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (files.length === 0) {
      setError('Choose at least one photo.')
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

      // The SAME field name for every photo, appended once per file.
      //
      // That is how a multipart request carries a list: not images[0],
      // images[1] -- just "images" repeated. FastAPI collects them into
      // list[UploadFile] in the order they were appended, which is why the
      // order of this array is the order of the post.
      files.forEach((f) => form.append('images', f))

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
              // multiple is the whole change. Without it the file picker only
              // ever hands back one file, however many are highlighted.
              //
              // capture was removed alongside it: on some phones it forces the
              // camera and hides the gallery entirely, which makes choosing
              // several existing photos impossible.
              multiple
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
                {files.length === 0 ? 'Choose photos' : 'Add more photos'}
              </span>
              <span className="text-tiny">
                {files.length === 0
                  ? `Up to ${MAX_PHOTOS}. JPEG, PNG, GIF or WebP, 5 MB each.`
                  : `${files.length} of ${MAX_PHOTOS} chosen`}
              </span>
            </button>
          </div>

          {/* The chosen photos, in the order they will appear.
           *
           * A scrolling strip rather than a grid, because it mirrors what the
           * post will actually be -- a row you swipe through. The numbers are
           * shown for the same reason: order is the thing that is easy to get
           * wrong and hard to notice afterwards. */}
          {previews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {previews.map((url, position) => (
                <div
                  key={url}
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-control border border-line"
                >
                  <img
                    src={url}
                    alt={`Photo ${position + 1} of ${previews.length}`}
                    className="h-full w-full object-cover"
                  />

                  <span className="absolute left-1 top-1 rounded-full bg-scrim px-2 text-tiny font-semibold text-on-scrim">
                    {position + 1}
                  </span>

                  <button
                    type="button"
                    onClick={() => removeFile(position)}
                    aria-label={`Remove photo ${position + 1}`}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-scrim text-on-scrim transition active:scale-90 hover:opacity-80"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              ))}
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
                {progress < 100
                  ? `Uploading ${progress}%`
                  : files.length > 1
                    ? `Saving ${files.length} photos...`
                    : 'Almost there...'}
              </p>
            </div>
          )}

          <Button
            type="submit"
            fullWidth
            disabled={submitting || files.length === 0}
          >
            {submitting ? 'Posting...' : 'Post'}
          </Button>
        </Card>
      </main>

      <BottomNav />
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import Header from '../components/Header'

// PLAN.md feature 4: "Add a photo by pasting an image link, with a caption."
// No file uploading -- we store the address of an image, never the image.
export default function CreatePost() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [imageUrl, setImageUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Tracks whether the pasted link actually loads. Without this you would
  // paste a broken address, save it, and only find out on your profile.
  const [imageBroken, setImageBroken] = useState(false)

  const showPreview = imageUrl.startsWith('http')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    // Checked here so the answer is instant. The backend checks the same rule
    // again, because anything running in a browser can be bypassed. Frontend
    // validation is for speed; backend validation is for correctness.
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      setError('Image link must start with http:// or https://')
      return
    }

    setSubmitting(true)

    try {
      // Note what is NOT sent: who the author is. The backend takes that from
      // the token. If the browser could choose it, anyone could post as
      // anyone else.
      await api.post('/posts', {
        image_url: imageUrl,
        caption: caption || null,
      })

      navigate(`/profile/${user.username}`)
    } catch (err) {
      setError(err.userMessage || 'Could not create the post.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">New post</h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="imageUrl"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Image link
            </label>
            <input
              id="imageUrl"
              type="url"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value)
                setImageBroken(false)
              }}
              required
              maxLength={500}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900"
              placeholder="https://picsum.photos/600"
            />
            <p className="mt-1 text-xs text-slate-500">
              Paste a link to an image. Try https://picsum.photos/600
            </p>
          </div>

          {/* The preview. onError fires when the browser cannot load the
              image, which is how we catch a wrong link before saving it. */}
          {showPreview && (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              {imageBroken ? (
                <p className="bg-amber-50 px-3 py-6 text-center text-sm text-amber-700">
                  That link did not load as an image. You can still post it,
                  but it will show as a broken picture.
                </p>
              ) : (
                <img
                  src={imageUrl}
                  alt="preview"
                  onError={() => setImageBroken(true)}
                  className="max-h-72 w-full object-cover"
                />
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="caption"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Caption{' '}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={2200}
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900"
              placeholder="Say something about it"
            />
            <p className="mt-1 text-right text-xs text-slate-400">
              {caption.length} / 2200
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 py-2 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? 'Posting...' : 'Post'}
          </button>
        </form>
      </main>
    </div>
  )
}

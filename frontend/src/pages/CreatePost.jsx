import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import BottomNav from '../components/BottomNav'
import Header from '../components/Header'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'

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

          <Input
            label="Image link"
            hint="Paste a link to an image. Try https://picsum.photos/600"
            type="url"
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value)
              setImageBroken(false)
            }}
            required
            maxLength={500}
            placeholder="https://picsum.photos/600"
          />

          {/* The preview. onError fires when the browser cannot load the
              image, which is how we catch a wrong link before saving it. */}
          {showPreview && (
            <div className="overflow-hidden rounded-control border border-line">
              {imageBroken ? (
                <p className="bg-warn-soft px-3 py-6 text-center text-small text-warn">
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

          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Posting...' : 'Post'}
          </Button>
        </Card>
      </main>

      <BottomNav />
    </div>
  )
}

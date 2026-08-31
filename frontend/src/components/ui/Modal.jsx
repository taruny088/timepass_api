import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

// A box that opens on top of the page.
//
// This looks like the simplest component in the app and is easily the
// fiddliest, which is exactly why it was deferred out of 11b until something
// real needed one. A modal built against nothing is a guess at what it needs.
//
// FIVE THINGS A DIALOG HAS TO DO, and only the first is obvious:
//
//   1. Close on Escape.
//   2. Close when you click the dark area behind it.
//   3. Keep keyboard focus INSIDE it while open. Without this, pressing Tab
//      walks invisibly out of the dialog and into the page behind -- you carry
//      on typing into things you cannot see.
//   4. Put focus BACK on the button that opened it when it closes. Otherwise a
//      keyboard user is dumped at the top of the page and has to navigate all
//      the way back.
//   5. Stop the page behind from scrolling when you reach the end of the list
//      inside.
//
// A NOTE ON PORTALS, because it is the word you will meet if you read about
// modals. A portal renders an element into a different part of the page than
// where you wrote it, which is how most modal libraries escape a parent that
// would clip them. We do not need one: this is position:fixed and nothing in
// this app clips it. Worth knowing the word for when it does become necessary.
export default function Modal({ open, onClose, title, children }) {
  // The dialog box itself. Needed so the focus trap can find the things inside.
  const panelRef = useRef(null)

  // Remembers which element was focused before we opened, so it can be given
  // focus back afterwards.
  const openerRef = useRef(null)

  useEffect(() => {
    if (!open) return

    // document.activeElement is whatever currently has keyboard focus -- here,
    // the button that was just pressed to open this.
    openerRef.current = document.activeElement

    // --- Scroll lock -------------------------------------------------------
    // Setting overflow:hidden on <body> stops the page behind scrolling. The
    // previous value is saved rather than assumed to be empty, so closing puts
    // back whatever was really there.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // --- Keyboard ----------------------------------------------------------
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      // --- The focus trap --------------------------------------------------
      //
      // Find everything inside the panel that can take focus. This selector is
      // the standard list; :not([disabled]) matters because a disabled button
      // is skipped by the browser and would otherwise leave a dead stop in the
      // cycle.
      const focusable = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )

      if (!focusable || focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      // The trap is just two wrap-arounds:
      //
      //   Shift+Tab on the FIRST thing  -> jump to the last
      //   Tab on the LAST thing         -> jump back to the first
      //
      // preventDefault stops the browser doing its normal move, which is what
      // would have carried focus out of the dialog.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    // Move focus into the dialog as it opens, so Tab starts from inside rather
    // than from wherever the page happened to be.
    panelRef.current?.focus()

    // The CLEANUP function. React runs it when the effect re-runs and when this
    // component disappears.
    //
    // Everything reached outside React has to be put back here. Forgetting the
    // scroll lock would leave the whole page unscrollable after the dialog
    // closed -- a bug that looks like the app has frozen.
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow

      // Focus restoration. The ?. matters: the opening button may itself have
      // disappeared while the dialog was open.
      openerRef.current?.focus?.()
    }
  }, [open, onClose])

  // Nothing rendered at all when closed. Returning null rather than hiding with
  // CSS means the contents genuinely are not on the page -- so a screen reader
  // cannot wander into them and no image inside starts downloading.
  if (!open) return null

  return (
    // The backdrop. Clicking it closes.
    <div
      onClick={onClose}
      className="fixed inset-0 z-30 flex items-end justify-center bg-scrim p-0 sm:items-center sm:p-4"
    >
      <div
        ref={panelRef}
        // role="dialog" and aria-modal tell a screen reader this is a dialog
        // and that the rest of the page is unavailable while it is open.
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        // tabIndex={-1} makes this focusable by code without putting it into
        // the normal Tab order. It is what lets panelRef.current.focus() work
        // above.
        tabIndex={-1}
        // WITHOUT THIS LINE THE DIALOG CLOSES WHEN YOU CLICK INSIDE IT.
        //
        // A click on the panel also counts as a click on the backdrop behind
        // it, because events travel outwards from what you clicked through
        // every parent -- that is called BUBBLING. stopPropagation ends that
        // journey here, so the backdrop's onClose never hears about it.
        onClick={(event) => event.stopPropagation()}
        // Mobile first: full width, stuck to the bottom of the screen like a
        // phone sheet. From sm: up it becomes a centred box.
        className="flex max-h-[85vh] w-full flex-col rounded-t-card border border-line bg-surface sm:max-w-sm sm:rounded-card"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="modal-title" className="text-h2 font-semibold text-ink">
            {title}
          </h2>

          <button
            onClick={onClose}
            aria-label="Close"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition active:scale-90 hover:bg-hover hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* overflow-y-auto on the CONTENT, not the panel, so the heading stays
            put while a long list scrolls underneath it. */}
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

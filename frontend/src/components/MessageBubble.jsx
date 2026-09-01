import { CircleAlert, Loader2 } from 'lucide-react'

// One message in a chat.
//
// Yours on the right, theirs on the left. That is the whole convention, and it
// is doing more work than it looks: it means neither bubble has to carry a name,
// which is what stops a screen of short messages turning into a wall of
// repeated usernames.
//
// Which side it goes on is decided by whoever draws it, not here. Chat.jsx
// knows who is logged in; this component just draws what it is told, which
// keeps it usable anywhere later.
export default function MessageBubble({ message, isMine, onRetry }) {
  // Set by Chat.jsx on a message that has been typed but not yet confirmed by
  // the server. See the optimistic-sending note there.
  const pending = message.pending
  const failed = message.failed

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      {/* max-w-[75%] rather than a fixed width. A bubble should be as wide as
          its words and no wider -- a three-letter reply in a full-width box
          looks like a mistake. The cap stops a long message reaching the far
          edge, which is what makes the left/right split readable at a glance.

          It is an arbitrary value, which this project normally avoids. The 4px
          spacing scale is about GAPS between things; this is a proportion of
          whatever the screen happens to be, which no fixed number can express. */}
      <div
        className={`max-w-[75%] rounded-card px-3 py-2 ${
          isMine
            ? 'bg-accent text-on-accent'
            : 'bg-hover text-ink'
        } ${pending ? 'opacity-60' : ''} ${failed ? 'opacity-60 ring-1 ring-danger' : ''}`}
      >
        {/* whitespace-pre-wrap keeps the line breaks somebody typed. Without it
            a message written as three lines arrives as one run-on sentence.
            break-words handles the other direction: one very long unbroken
            string -- a pasted link -- wraps instead of pushing the page
            sideways. */}
        <p className="whitespace-pre-wrap break-words text-body">
          {message.body}
        </p>

        {/* The state line under the text, and only when there is something to
            say. A confirmed message says nothing at all -- a tick on every
            bubble is noise, and the absence of a warning is the confirmation. */}
        {(pending || failed) && (
          <p
            className={`mt-1 flex items-center gap-1 text-tiny ${
              failed ? 'text-danger' : 'text-on-accent'
            }`}
          >
            {pending && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Sending
              </>
            )}
            {failed && (
              <>
                <CircleAlert className="h-3 w-3" aria-hidden="true" />
                Not sent
                {/* THE RETRY IS THE WHOLE POINT OF SHOWING THE FAILURE.
                    Telling somebody their message did not send, and leaving
                    them to retype it, is barely better than losing it quietly.
                    The text is still here -- it only needs sending again. */}
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(message)}
                    className="font-semibold underline"
                  >
                    Try again
                  </button>
                )}
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

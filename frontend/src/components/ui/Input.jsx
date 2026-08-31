import { useId } from 'react'

// A label, a box to type in, and an optional line of help, as one piece.
//
// There were ten of these written out by hand. Every one repeated the same
// three-part structure, and every one had to remember to wire the label to the
// input correctly. Getting that wiring wrong is invisible on screen and breaks
// the page for anyone using a screen reader.
export default function Input({
  label,
  hint,
  // hideLabel keeps the label for a screen reader but takes it off the screen.
  //
  // Use it only where the box already explains itself visually -- a search
  // field under a heading that says "Find people", or a comment box with
  // "Add a comment..." written inside it. Instagram shows no label on either.
  //
  // What it must NOT become is an excuse to drop labels generally. A
  // placeholder is not a label: it disappears the moment you start typing, so
  // anyone who pauses mid-form has nothing left telling them what the box was
  // for, and some screen readers ignore placeholders entirely.
  hideLabel = false,
  // multiline turns this into a <textarea>. One prop rather than a second
  // near-identical component, because everything else about them is the same.
  multiline = false,
  className = '',
  ...rest
}) {
  // WHY THE ID IS GENERATED AND NOT PASSED IN.
  //
  // htmlFor on the label must match id on the input. That pairing is what makes
  // tapping the word "Email" put the cursor in the box -- and, far more
  // importantly, it is what makes a screen reader announce "Email, edit text"
  // instead of just "edit text", leaving someone to guess what the box wants.
  //
  // Every id on a page has to be unique. Signup has four of these on screen at
  // once. Left to the caller, sooner or later two would collide and the label
  // would silently point at the wrong box. useId cannot collide.
  //
  // This is the same hook Logo.jsx uses for its gradient, for the same reason.
  const id = useId()
  const hintId = `${id}-hint`

  // Both elements take identical styling, so it is written once.
  //
  // min-h-11 for the same reason as Button: 44 pixels is roughly how accurate a
  // fingertip is.
  const fieldStyles =
    'w-full min-h-11 rounded-control border border-line bg-surface px-3 py-2 ' +
    'text-body text-ink placeholder:text-ink-muted outline-none transition ' +
    'focus:border-ink'

  // A variable holding a component, so the return below does not need the same
  // block written twice with one word different. A capital letter is required:
  // JSX treats a lowercase name as a plain HTML tag.
  const Field = multiline ? 'textarea' : 'input'

  return (
    <div>
      <label
        htmlFor={id}
        className={
          hideLabel
            ? 'sr-only'
            : 'mb-1 block text-strong font-semibold text-ink'
        }
      >
        {label}
      </label>

      <Field
        id={id}
        // aria-describedby points the screen reader at the hint, so it reads
        // "Username, edit text, letters numbers and underscores only" as one
        // thought. Without it the hint is just loose text further down the page
        // that may never be reached.
        //
        // undefined rather than '' when there is no hint: React leaves the
        // attribute off entirely, instead of writing an empty one pointing at
        // nothing.
        aria-describedby={hint ? hintId : undefined}
        className={`${fieldStyles} ${multiline ? 'resize-none' : ''} ${className}`}
        {...rest}
      />

      {hint && (
        <p id={hintId} className="mt-1 text-tiny text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

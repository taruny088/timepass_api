// One button, four looks.
//
// THE PROBLEM THIS SOLVES. There were ten hand-written buttons in the app, and
// no two agreed. Different padding, different corners, some with a disabled
// state and some without. Nobody wrote them carelessly -- each one was written
// on its own, months apart, and there was nothing to copy from. The ninth is
// always the odd one out.
//
// With this file, "what does a button look like" is answered once.

// A VARIANT is the kind of button, not its colour -- the caller says what the
// button is FOR and this file decides how that looks.
//
//   primary    the main action on the screen. Log in. Post. Follow.
//   secondary  a real action, but not the one you came for. Load more.
//   ghost      barely a button. Navigation, toolbar items.
//   danger     destructive. Delete.
//
// Keeping them in a plain object means adding a fifth is one line here, and
// every button in the app can use it immediately.
const VARIANTS = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-hover disabled:bg-accent-soft',
  secondary:
    'border border-line bg-surface text-ink hover:bg-hover disabled:text-ink-muted',
  ghost: 'text-ink hover:bg-hover disabled:text-ink-muted',
  danger: 'text-danger hover:bg-danger-soft disabled:text-ink-muted',
}

// Shared by every variant regardless of look.
//
// min-h-11 is 44 pixels, and it is the one number here worth remembering. A
// mouse pointer is accurate to a single pixel; a fingertip is accurate to about
// 44. Anything smaller is a button you have to aim at, and aiming at things on
// a phone is how an app starts feeling cheap. The old buttons were py-1.5 --
// about 30 pixels tall.
//
// active:scale-[0.98] is the press. The button shrinks a fraction the instant
// it is touched, before any request has been sent, so a slow network feels like
// a slow network rather than a broken button.
//
// focus-visible: is for keyboard users only -- it draws a ring when you reach a
// button by tabbing, but not when you click it with a mouse. "focus" alone
// would put a ring around every button you clicked, which is why people used to
// remove it and break keyboard navigation in the process.
const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control ' +
  'px-4 py-2 text-strong font-semibold transition ' +
  'active:scale-[0.98] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:active:scale-100'

export default function Button({
  variant = 'primary',
  fullWidth = false,
  className = '',
  children,
  // ...rest gathers up every OTHER prop into one object -- onClick, disabled,
  // type, aria-label, anything. Spreading it onto the <button> below passes
  // them all straight through.
  //
  // Without this, Button would have to list every attribute a button might ever
  // need, and adding one would mean editing this file. With it, Button styles
  // the button and stays out of the way of what it does.
  ...rest
}) {
  return (
    <button
      // Order matters: className last, so a caller can override something for a
      // genuine one-off. Rare, and it should stay rare -- if you find yourself
      // overriding the same thing twice, it wants to be a variant instead.
      className={`${BASE} ${VARIANTS[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {/* children is whatever sits between the tags: <Button>Log in</Button>
          arrives here as the words "Log in". It is how a shared component wraps
          content it knows nothing about. */}
      {children}
    </button>
  )
}

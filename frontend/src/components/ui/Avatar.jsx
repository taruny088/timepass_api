// A profile picture, or the first letter of the username when there is none.
//
// This exact ternary was written out three times -- in PostCard, Profile and
// Search -- at three different sizes, each with its own copy of the fallback
// circle. Phase 12 adds real uploaded avatars, and when it does, this is the
// one file that has to change.

// Three sizes, named rather than numbered, so a caller asks for what it needs
// instead of remembering that a post header uses 32 pixels.
//
// Every size is a multiple of 4, and the text scales with the circle -- a 12px
// letter looks lost in an 80px circle.
const SIZES = {
  sm: 'h-8 w-8 text-tiny', // 32px -- post headers, comment rows
  md: 'h-10 w-10 text-strong', // 40px -- search results, lists
  lg: 'h-20 w-20 text-h1', // 80px -- the profile page
}

export default function Avatar({ src, username, size = 'md', className = '' }) {
  // shrink-0 on both branches, always.
  //
  // An avatar almost always sits in a flex row next to text. A flex item
  // shrinks by default, and when the text beside it is long, the row takes the
  // space out of the picture -- which turns a round photo into an oval. This is
  // the bug we hit on the profile page on a phone. Fixing it here means it
  // cannot come back anywhere else.
  const shared = `${SIZES[size]} shrink-0 rounded-full ${className}`

  if (src) {
    return (
      <img
        src={src}
        // The alt text a screen reader reads, and what shows if the image fails
        // to load. The username is the only meaningful thing we can say about
        // it -- "avatar" would tell nobody anything.
        alt={username}
        // object-cover crops to fill the circle instead of squashing. Without
        // it, a photo taller than it is wide arrives visibly stretched.
        className={`${shared} object-cover`}
      />
    )
  }

  return (
    <div
      className={`${shared} flex items-center justify-center bg-avatar font-semibold text-on-accent`}
      // aria-hidden because the letter is decoration, not information. Every
      // place this is used already shows the username as real text right next
      // to it, and a screen reader announcing "J" before "john_23" is noise.
      aria-hidden="true"
    >
      {username[0].toUpperCase()}
    </div>
  )
}

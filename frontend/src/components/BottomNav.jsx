import { House, Search, SquarePlus } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Avatar from './ui/Avatar'

// The bar of icons along the bottom, on a phone only.
//
// WHY THE BOTTOM. It is where your thumb already is. Holding a phone one-handed
// puts your thumb in the lower half of the screen; the top corners are the
// hardest place on the whole device to reach. Every phone app you use daily
// puts its main navigation down here, and none of them explain why either.
//
// It disappears at md: and up, where Header takes the navigation back into the
// top bar -- a laptop has no thumb problem and plenty of width.
export default function BottomNav() {
  const { user } = useAuth()

  return (
    <nav
      // fixed, not sticky. Sticky stays in the page and only pins once you
      // scroll to it; fixed is glued to the screen and ignores scrolling
      // entirely, which is what a bottom bar has to do.
      //
      // inset-x-0 is left-0 right-0: stretch the full width.
      //
      // z-20 puts it above the page content. The header is z-10, and this needs
      // to sit above anything that scrolls underneath it.
      //
      // pb-[env(safe-area-inset-bottom)] is the iPhone fix. The bottom strip of
      // a modern iPhone belongs to the home indicator, and taps there are
      // partly swallowed by the system. env(safe-area-inset-bottom) asks the
      // device how much room to leave: zero on most Androids and older phones,
      // about 34 pixels on a recent iPhone. Without it the bar looks right in
      // the simulator and is annoying to tap on a real phone.
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Main"
    >
      <ul className="flex items-center justify-around">
        <NavItem to="/" icon={House} label="Home" end />
        <NavItem to="/search" icon={Search} label="Search" />
        <NavItem to="/create" icon={SquarePlus} label="New post" />

        {/* The profile tab shows your own picture rather than a generic icon,
            which is what Instagram does and what makes the bar feel like yours.
            It is also genuinely dynamic -- upload an avatar in Phase 12 and it
            appears here with no code change. */}
        <NavItem
          to={`/profile/${user.username}`}
          label="My profile"
          avatar={user}
        />
      </ul>
    </nav>
  )
}

// One tab. Kept in this file because nothing else will ever use it.
function NavItem({ to, icon, label, avatar, end = false }) {
  const Icon = icon

  return (
    <li className="flex-1">
      {/* NavLink is a Link that knows whether it is the page you are on. Give
          it a function for className and it hands back isActive.
          A plain Link cannot do this -- you would have to compare the current
          address by hand on every item.

          `end` matters on "/" only. Without it, React Router treats "/" as
          matching every address that starts with a slash -- which is all of
          them -- and Home would light up on every page. */}
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          `flex min-h-11 items-center justify-center py-3 transition ${
            isActive ? 'text-ink' : 'text-ink-muted'
          }`
        }
      >
        {({ isActive }) => (
          <>
            {avatar ? (
              <Avatar
                src={avatar.avatar_url}
                username={avatar.username}
                size="sm"
                // A ring around your own picture when you are on your profile.
                // The icons show "you are here" by going solid; the avatar
                // cannot, so it gets a ring instead.
                className={isActive ? 'ring-2 ring-ink' : ''}
              />
            ) : (
              <Icon
                className="h-6 w-6"
                // The active tab is filled in, the rest are outlines. This is
                // how every phone app signals which tab you are on, and it
                // reads instantly without needing a colour to carry the whole
                // message -- which matters if you cannot distinguish the
                // colours easily.
                fill={isActive ? 'currentColor' : 'none'}
                aria-hidden="true"
              />
            )}

            {/* The hidden label. Every icon in this app needs one -- a shape
                means nothing to a screen reader, and without this the whole
                navigation announces itself as four unlabelled links. */}
            <span className="sr-only">{label}</span>
          </>
        )}
      </NavLink>
    </li>
  )
}

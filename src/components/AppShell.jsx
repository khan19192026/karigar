import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home, Users, Plus, ClipboardList, MessageSquare, Wallet } from 'lucide-react'
import InstallPrompt from './InstallPrompt'
import { useSession } from '../store/session'
import { subscribeToInbox, unreadCount } from '../lib/chat'

/**
 * The bottom navigation. The 480px frame itself lives in MobileFrame, one
 * level up, so that onboarding sits inside the same shell as everything
 * else rather than sprawling across a desktop window.
 */
export default function AppShell() {
  const { isTechnician, profile } = useSession()
  const { pathname } = useLocation()
  const [unread, setUnread] = useState(0)

  // Live badge, so a karigar sees a waiting customer without opening the tab.
  useEffect(() => {
    if (!profile) return
    const refresh = () => unreadCount().then(setUnread).catch(() => {})
    refresh()
    return subscribeToInbox(refresh)
  }, [profile, pathname])

  // The last tab is the same slot for both roles, but a customer manages jobs
  // there and a karigar manages leads and money. Name it for what the person
  // actually does.
  const lastTab = isTechnician
    ? { to: '/me', label: 'Leads', icon: Wallet }
    : { to: '/me', label: 'My Jobs', icon: ClipboardList }

  const tabs = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/directory', label: 'Directory', icon: Users },
    { to: '/post-job', label: 'Post Job', icon: Plus, raised: true },
    { to: '/chats', label: 'Chats', icon: MessageSquare, badge: unread },
    lastTab,
  ]

  return (
    <>
      <main className="pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+16px)]">
        <Outlet />
      </main>

      {/* Only on the main tabs — never over onboarding or the admin panel. */}
      <InstallPrompt />

      <nav
        aria-label="Primary"
        className="shell fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur
          pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5">
            {tabs.map((tab) => (
              <li key={tab.label} className="flex justify-center">
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  aria-current={pathname === tab.to ? 'page' : undefined}
                  className="tap flex w-full flex-col items-center justify-center gap-1 py-2"
                >
                  {({ isActive }) =>
                    tab.raised ? (
                      <>
                        <span
                          className={`-mt-5 grid h-12 w-12 place-items-center rounded-2xl shadow-lg shadow-amber/30 press
                            ${isActive ? 'bg-amber-deep text-white' : 'bg-amber text-ink'}`}
                        >
                          <tab.icon className="w-6 h-6" strokeWidth={2.5} aria-hidden="true" />
                        </span>
                        <span className="text-[10px] font-bold text-amber-deep">{tab.label}</span>
                      </>
                    ) : (
                      <>
                        <span className="relative">
                          <tab.icon
                            className={`w-[22px] h-[22px] ${isActive ? 'text-royal' : 'text-ink-muted'}`}
                            strokeWidth={isActive ? 2.4 : 1.9}
                            aria-hidden="true"
                          />
                          {tab.badge > 0 && (
                            <span
                              className="tnum absolute -right-2 -top-1.5 grid min-w-[16px] place-items-center rounded-full
                                bg-alert px-1 text-[9px] font-bold leading-4 text-white"
                              aria-label={`${tab.badge} naye message`}
                            >
                              {tab.badge > 9 ? '9+' : tab.badge}
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${isActive ? 'text-royal' : 'text-ink-muted'}`}
                        >
                          {tab.label}
                        </span>
                      </>
                    )
                  }
                </NavLink>
              </li>
            ))}
        </ul>
      </nav>
    </>
  )
}

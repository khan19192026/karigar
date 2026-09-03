import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import Home from './pages/Home'
import Directory from './pages/Directory'
import PostJob from './pages/PostJob'
import Me from './pages/Me'
import Onboarding from './pages/Onboarding'
import AdminConfig from './pages/AdminConfig'
import Banned from './pages/Banned'
import Inbox from './pages/Inbox'
import Chat from './pages/Chat'
import { Loading } from './components/ui'
import { useSession } from './store/session'
import { BROWSE_KEY } from './lib/constants'
import { isDemo } from './lib/db'

/**
 * The 480px shell. Edge to edge on a phone; on a desktop it centres against
 * a royal backdrop so the app reads as a device rather than a stranded
 * column. Every route lives inside it, onboarding included.
 */
function MobileFrame({ children }) {
  return (
    <div className="min-h-dvh bg-royal-deep">
      <div className="shell relative min-h-dvh bg-canvas shadow-[0_0_60px_rgba(15,23,42,0.18)]">
        {/* Says plainly that the data is local and seeded, so nobody demos
            this to a customer thinking the jobs are real. */}
        {isDemo && (
          <p className="bg-ink px-4 py-1.5 text-center text-[11px] font-semibold text-white/85">
            Demo data — stored on this device only
          </p>
        )}
        {children}
      </div>
    </div>
  )
}

function RequireProfile({ children }) {
  const { profile, loading } = useSession()
  if (loading) return <Loading />
  if (!profile) return <Navigate to="/onboarding" replace />
  return children
}

/** A first-time visitor meets the role picker. Anyone who has signed in, or
 *  chosen to browse, goes straight to the categories. */
function RootGate() {
  const { profile, loading } = useSession()
  if (loading) return <Loading />
  const browsing = sessionStorage.getItem(BROWSE_KEY) === '1'
  if (!profile && !browsing) return <Navigate to="/onboarding" replace />
  return <Home />
}

export default function App() {
  const { isBanned, loading } = useSession()

  // A banned account gets one screen and no navigation. Checked here rather
  // than per route so there is no gap a deep link could slip through.
  if (!loading && isBanned) {
    return (
      <MobileFrame>
        <Banned />
      </MobileFrame>
    )
  }

  return (
    <MobileFrame>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/admin-config" element={<AdminConfig />} />

        <Route element={<AppShell />}>
          <Route index element={<RootGate />} />
          <Route path="/directory" element={<Directory />} />
          <Route
            path="/post-job"
            element={
              <RequireProfile>
                <PostJob />
              </RequireProfile>
            }
          />
          <Route
            path="/me"
            element={
              <RequireProfile>
                <Me />
              </RequireProfile>
            }
          />
          <Route
            path="/chats"
            element={
              <RequireProfile>
                <Inbox />
              </RequireProfile>
            }
          />
        </Route>

        {/* Outside the shell: a thread needs the full height for its
            composer, and the bottom nav would sit on top of it. */}
        <Route
          path="/chats/:id"
          element={
            <RequireProfile>
              <Chat />
            </RequireProfile>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MobileFrame>
  )
}

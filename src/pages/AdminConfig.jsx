import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock } from 'lucide-react'
import AdminOverview from '../components/admin/AdminOverview'
import AdminKarigars from '../components/admin/AdminKarigars'
import AdminUsers from '../components/admin/AdminUsers'
import AdminJobs from '../components/admin/AdminJobs'
import AdminAudit from '../components/admin/AdminAudit'
import AdminSettings from '../components/admin/AdminSettings'
import { Button, EmptyState, Loading, Pill } from '../components/ui'
import { isDemo } from '../lib/db'
import { useSession } from '../store/session'

const TABS = [
  { key: 'overview', label: 'Overview', Panel: AdminOverview },
  { key: 'karigars', label: 'Karigars', Panel: AdminKarigars },
  { key: 'users', label: 'Users', Panel: AdminUsers },
  { key: 'jobs', label: 'Jobs', Panel: AdminJobs },
  { key: 'audit', label: 'Audit', Panel: AdminAudit },
  { key: 'settings', label: 'Settings', Panel: AdminSettings },
]

/**
 * The admin panel, on the route the spec named: /admin-config.
 *
 * The gate below is convenience only. Real enforcement lives in Postgres —
 * every admin write goes through an RPC that re-checks is_admin(), and the
 * config_admin_write policy rejects a non-admin's write whatever the UI does.
 */
export default function AdminConfig() {
  const navigate = useNavigate()
  const { isAdmin, loading } = useSession()
  const [tab, setTab] = useState('overview')

  // In demo mode everything is local to this device, so the gate would only
  // get in the way of trying the app out.
  const allowed = isAdmin || isDemo

  if (loading) return <Loading />

  if (!allowed) {
    return (
      <div className="px-5 pt-8">
        <EmptyState
          icon={Lock}
          title="Admin access only"
          body="This panel can ban accounts and change what every karigar pays. Ask an administrator to grant your account the admin role."
          action={
            <Button variant="outline" full onClick={() => navigate('/')}>
              Back to home
            </Button>
          }
        />
      </div>
    )
  }

  const Panel = TABS.find((t) => t.key === tab)?.Panel || AdminOverview

  return (
    <div className="pb-10">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas">
        <div className="flex items-center gap-3 bg-card px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Go back"
            className="tap -ml-2 grid place-items-center rounded-full text-ink-soft hover:bg-canvas"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[16px] font-bold leading-tight text-ink">Admin panel</h1>
            <p className="truncate text-[12px] text-ink-soft">
              {isDemo ? 'Demo data on this device' : 'Live — changes apply immediately'}
            </p>
          </div>
        </div>

        <nav aria-label="Admin sections" className="no-scrollbar flex gap-2 overflow-x-auto px-5 py-2.5">
          {TABS.map((t) => (
            <Pill key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </Pill>
          ))}
        </nav>
      </header>

      <div className="px-5 pt-4">
        <Panel />
      </div>
    </div>
  )
}

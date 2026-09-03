import { Navigate, useNavigate } from 'react-router-dom'
import { LogOut, RotateCcw, Settings2, ShieldCheck } from 'lucide-react'
import LeadCenter from './LeadCenter'
import MyJobs from './MyJobs'
import { Loading, useToast } from '../components/ui'
import { useSession } from '../store/session'
import { auth, isDemo } from '../lib/db'
import { clearBlobs } from '../lib/blobStore'
import { prettyPhone } from '../lib/format'

/**
 * The fourth tab is one route with two faces — a customer's job history or
 * a karigar's lead centre. The account controls are shared, and sit at the
 * bottom where they belong: reachable, but never in the way.
 */
export default function Me() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile, loading, isTechnician, isAdmin, signOut, refresh } = useSession()

  if (loading) return <Loading />
  if (!profile) return <Navigate to="/onboarding" replace />

  async function promoteToAdmin() {
    await auth.updateProfile({ user_role: 'admin' })
    await refresh()
    toast('This account is now an admin', 'success')
    navigate('/admin-config')
  }

  async function handleSignOut() {
    await signOut()
    toast('Signed out')
    navigate('/onboarding', { replace: true })
  }

  async function handleReset() {
    // Chat media lives in IndexedDB, not localStorage, so it needs clearing
    // separately or photos and videos survive the reset.
    await Promise.all([auth.resetDemo(), clearBlobs()])
    window.location.href = '/'
  }

  return (
    <div>
      {isTechnician ? <LeadCenter /> : <MyJobs />}

      <section className="mt-8 px-5 pb-6" aria-labelledby="account-heading">
        <h2 id="account-heading" className="eyebrow mb-2 px-1 text-ink-muted">
          Account
        </h2>

        <div className="card divide-y divide-line overflow-hidden">
          <div className="px-4 py-3.5">
            <p className="text-[14px] font-bold text-ink">{profile.full_name}</p>
            <p className="tnum text-[13px] text-ink-soft">{prettyPhone(profile.phone_number)}</p>
            <p className="eyebrow mt-1 text-ink-muted">
              {isTechnician ? 'Karigar' : isAdmin ? 'Admin' : 'Customer'}
            </p>
          </div>

          {(isAdmin || isDemo) && (
            <button
              type="button"
              onClick={() => navigate('/admin-config')}
              className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-semibold text-ink"
            >
              <Settings2 className="w-[18px] h-[18px] text-ink-soft" aria-hidden="true" />
              Admin panel
              {!isAdmin && isDemo && (
                <span className="eyebrow ml-auto text-ink-muted">Demo</span>
              )}
            </button>
          )}

          {/* Demo only: there is no SQL console here, so this is the way to
              see the panel as a real admin would. */}
          {isDemo && !isAdmin && (
            <button
              type="button"
              onClick={promoteToAdmin}
              className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left text-[13px] font-semibold text-ink-muted"
            >
              <ShieldCheck className="w-[18px] h-[18px]" aria-hidden="true" />
              Make this account an admin
            </button>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-semibold text-alert"
          >
            <LogOut className="w-[18px] h-[18px]" aria-hidden="true" />
            Sign out
          </button>

          {isDemo && (
            <button
              type="button"
              onClick={handleReset}
              className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left text-[13px] font-semibold text-ink-muted"
            >
              <RotateCcw className="w-[18px] h-[18px]" aria-hidden="true" />
              Reset demo data
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

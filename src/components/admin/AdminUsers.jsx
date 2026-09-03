import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Undo2 } from 'lucide-react'
import BanSheet from './BanSheet'
import { SearchBar } from './AdminKarigars'
import { Button, Chip, Loading, useToast } from '../ui'
import { admin } from '../../lib/db'
import { initials, prettyPhone, timeAgo } from '../../lib/format'

/** Customer and admin accounts. Karigars live on their own tab, because the
 *  actions you take on them are different. */
export default function AdminUsers() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [banTarget, setBanTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await admin.listUsers())
    } catch {
      toast('Could not load users', 'alert')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.full_name, r.phone_number].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)),
    )
  }, [rows, query])

  async function confirmBan(target, banned, reason) {
    try {
      await admin.setBan(target.userId, banned, reason)
      toast(banned ? `${target.name} is banned` : `${target.name} is restored`, banned ? 'alert' : 'success')
      load()
    } catch (err) {
      toast(
        err.message === 'CANNOT_BAN_SELF' ? 'You cannot ban your own account' : 'Could not update the account',
        'alert',
      )
    }
  }

  if (loading) return <Loading label="Loading users" />

  return (
    <div className="space-y-3">
      <SearchBar value={query} onChange={setQuery} placeholder="Name or mobile number" />

      {visible.length === 0 ? (
        <p className="card p-4 text-center text-[13px] text-ink-soft">No user matches that search.</p>
      ) : (
        visible.map((row) => (
          <article key={row.id} className={`card p-3.5 ${row.is_banned ? 'border-alert/30 bg-alert-wash' : ''}`}>
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-royal-wash text-[14px] font-bold text-royal">
                {initials(row.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[14.5px] font-bold leading-tight text-ink">{row.full_name}</h3>
                <p className="tnum text-[12.5px] text-ink-soft">{prettyPhone(row.phone_number)}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {row.is_banned && <Chip tone="alert">Banned</Chip>}
                  <Chip tone={row.user_role === 'admin' ? 'royal' : 'neutral'}>
                    {row.user_role === 'admin' ? 'Admin' : 'Customer'}
                  </Chip>
                  <Chip>
                    <span className="tnum">{row.job_count}</span>
                    {row.job_count === 1 ? ' job' : ' jobs'}
                  </Chip>
                  <Chip>Joined {timeAgo(row.created_at)}</Chip>
                </div>
                {row.is_banned && row.banned_reason && (
                  <p className="mt-1.5 text-[11.5px] italic text-alert">Reason: {row.banned_reason}</p>
                )}
              </div>
            </div>

            <div className="mt-3 border-t border-line pt-3">
              <Button
                variant={row.is_banned ? 'success' : 'alert'}
                size="sm"
                full
                onClick={() =>
                  setBanTarget({
                    userId: row.id,
                    name: row.full_name,
                    phone: row.phone_number,
                    isBanned: row.is_banned,
                  })
                }
              >
                {row.is_banned ? (
                  <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {row.is_banned ? 'Restore account' : 'Ban account'}
              </Button>
            </div>
          </article>
        ))
      )}

      <BanSheet target={banTarget} onClose={() => setBanTarget(null)} onConfirm={confirmBan} />
    </div>
  )
}

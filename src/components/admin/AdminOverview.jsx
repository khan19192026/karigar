import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  BriefcaseBusiness,
  Clock,
  ShieldCheck,
  ShieldOff,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react'
import { Loading } from '../ui'
import { admin } from '../../lib/db'
import { pkr } from '../../lib/format'

/**
 * Six independent counts, so these are stat tiles rather than a chart —
 * there is no series to compare and nothing for colour to encode.
 *
 * Consequently the numbers wear ink tokens, not accent colours: a big
 * coloured figure would imply a category that does not exist. The only
 * coloured tile is "Banned", because that one genuinely reports a *state*
 * an admin should notice, and coral is reserved for exactly that.
 */
export default function AdminOverview() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    admin
      .overview()
      .then(setData)
      .catch(() => setError(true))
  }, [])

  if (error) {
    return (
      <p className="card p-4 text-[13px] leading-relaxed text-ink-soft">
        Could not load the overview. Your account may not have the admin role.
      </p>
    )
  }
  if (!data) return <Loading label="Loading overview" />

  const tiles = [
    { label: 'Customers', value: data.customers, icon: Users, hint: 'Signed-up accounts' },
    { label: 'Karigars', value: data.technicians, icon: BriefcaseBusiness, hint: 'Listed in the directory' },
    { label: 'CNIC verified', value: data.verified, icon: ShieldCheck, hint: `of ${data.technicians} karigars` },
    { label: 'Open jobs', value: data.jobs_open, icon: BriefcaseBusiness, hint: `${data.jobs_total} posted all time` },
    { label: 'Leads sold', value: data.leads_sold, icon: Ticket, hint: 'Contacts unlocked' },
    { label: 'Awaiting reply', value: data.awaiting ?? 0, icon: Clock, hint: 'Customer confirmation' },
    { label: 'Discrepancies', value: data.discrepancies ?? 0, icon: AlertTriangle, hint: 'Amounts disagreed', alert: true },
    { label: 'In debt', value: data.in_debt ?? 0, icon: Wallet, hint: 'Negative wallets', alert: true },
    { label: 'Strikes', value: data.strikes ?? 0, icon: ShieldOff, hint: 'Active, not voided', alert: true },
    { label: 'Banned', value: data.banned, icon: Ban, hint: 'Accounts blocked', alert: true },
  ]

  return (
    <div className="space-y-3">
      {/* Revenue is the one number that deserves to be read first, so it gets
          the hero treatment instead of a seventh identical tile. */}
      <div className="card p-4">
        <p className="eyebrow text-ink-muted">Total revenue</p>
        <p className="tnum mt-1 text-[32px] font-extrabold leading-none text-ink">
          {pkr(Number(data.revenue) + Number(data.commission ?? 0))}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 border-t border-line pt-2 text-[12px] text-ink-soft">
          <p>
            <span className="tnum block font-semibold text-ink">{pkr(data.revenue)}</span>
            lead fees
          </p>
          <p>
            <span className="tnum block font-semibold text-ink">{pkr(data.commission ?? 0)}</span>
            job commission
          </p>
        </div>
        <p className="mt-2 border-t border-line pt-2 text-[12px] text-ink-soft">
          <span className="tnum font-semibold text-ink">{pkr(data.wallet_float)}</span> sitting unspent in
          karigar wallets
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card p-3.5">
            <div className="flex items-center gap-1.5">
              <t.icon
                className={`w-3.5 h-3.5 ${t.alert && t.value > 0 ? 'text-alert' : 'text-ink-muted'}`}
                strokeWidth={2.2}
                aria-hidden="true"
              />
              <p className="eyebrow text-ink-muted">{t.label}</p>
            </div>
            <p
              className={`tnum mt-1.5 text-[24px] font-extrabold leading-none ${
                t.alert && t.value > 0 ? 'text-alert' : 'text-ink'
              }`}
            >
              {t.value}
            </p>
            <p className="tnum mt-1 text-[11px] text-ink-muted">{t.hint}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

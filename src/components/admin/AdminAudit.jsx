import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ShieldOff, Undo2 } from 'lucide-react'
import { Button, Chip, Loading, Pill, useToast } from '../ui'
import { admin } from '../../lib/db'
import { pkr, timeAgo } from '../../lib/format'

/**
 * Discrepancies and strikes.
 *
 * The automatic audit is a *signal*, not a verdict. Amounts differ for
 * honest reasons — parts bought separately, scope changed on site, a
 * discount given, a customer misremembering or lying to get even. So every
 * strike here can be voided, which refunds the fine, lifts the freeze and
 * un-bans on a voided strike 3.
 */
export default function AdminAudit() {
  const toast = useToast()
  const [tab, setTab] = useState('flags')
  const [flags, setFlags] = useState([])
  const [strikes, setStrikes] = useState([])
  const [reveals, setReveals] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, s, r] = await Promise.all([
        admin.listDiscrepancies(),
        admin.listStrikes(),
        admin.listReveals(),
      ])
      setFlags(f)
      setStrikes(s)
      setReveals(r)
    } catch {
      toast('Audit data load nahi hua', 'alert')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  async function voidStrike(strike) {
    try {
      await admin.voidStrike(strike.id, 'Admin reviewed — not misreporting')
      toast('Strike hata di gayi', 'success')
      load()
    } catch {
      toast('Strike hataayi nahi ja saki', 'alert')
    }
  }

  async function sweep() {
    try {
      const n = await admin.closeStale()
      toast(n > 0 ? `${n} purane kaam band kar diye` : 'Koi purana kaam nahi tha', 'success')
      load()
    } catch {
      toast('Sweep nahi chala', 'alert')
    }
  }

  async function refundReveal(reveal) {
    try {
      await admin.refundReveal(reveal.id, 'Customer ne call nahi ki')
      toast(`${pkr(reveal.cost_paid)} wapas kar diye`, 'success')
      load()
    } catch {
      toast('Refund nahi hua', 'alert')
    }
  }

  if (loading) return <Loading label="Audit load ho raha hai" />

  return (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        <Pill active={tab === 'flags'} onClick={() => setTab('flags')}>
          Discrepancies ({flags.length})
        </Pill>
        <Pill active={tab === 'strikes'} onClick={() => setTab('strikes')}>
          Strikes ({strikes.filter((s) => !s.is_void).length})
        </Pill>
        <Pill active={tab === 'contacts'} onClick={() => setTab('contacts')}>
          Contacts
        </Pill>
      </div>

      {tab === 'contacts' && (
        <>
          <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
            Directory se kharide gaye contacts. Agar karigar kahe ke customer ne tap kiya lekin call
            nahi ki, tou paise wapas kar dein — warna uska bharosa uth jayega.
          </p>

          {reveals.length === 0 ? (
            <p className="card p-4 text-center text-[13px] text-ink-soft">
              Abhi tak koi contact kharida nahi gaya.
            </p>
          ) : (
            reveals.map((r) => (
              <article key={r.id} className={`card p-3.5 ${r.refunded ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14px] font-bold text-ink">{r.technician_name}</h3>
                    <p className="text-[12px] text-ink-soft">
                      {r.customer_name} · {timeAgo(r.created_at)}
                    </p>
                  </div>
                  <Chip tone={r.refunded ? 'neutral' : r.was_free ? 'royal' : 'success'}>
                    {r.refunded ? 'Refunded' : r.was_free ? 'Free' : pkr(r.cost_paid)}
                  </Chip>
                </div>
                {r.refunded && r.refund_reason && (
                  <p className="mt-1.5 text-[11.5px] italic text-ink-muted">{r.refund_reason}</p>
                )}
                {!r.refunded && Number(r.cost_paid) > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    full
                    className="mt-3"
                    onClick={() => refundReveal(r)}
                  >
                    <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                    {pkr(r.cost_paid)} wapas karein
                  </Button>
                )}
              </article>
            ))
          )}
        </>
      )}

      {tab === 'flags' && (
        <>
          <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
            Yeh sirf ishara hai, faisla nahi. Karigar se baat karein — mumkin hai parts alag khareede
            hon ya kaam barh gaya ho.
          </p>

          {flags.length === 0 ? (
            <p className="card p-4 text-center text-[13px] text-ink-soft">
              Koi discrepancy nahi. Dono taraf ke amounts mil rahe hain.
            </p>
          ) : (
            flags.map((job) => {
              const tech = Number(job.technician_amount) || 0
              const cust = Number(job.customer_amount) || 0
              const gap = Math.abs(tech - cust)
              return (
                <article key={job.id} className="card border-alert/30 bg-alert-wash p-3.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className="mt-0.5 w-4 h-4 shrink-0 text-alert"
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[14px] font-bold leading-snug text-ink">{job.title}</h3>
                      <p className="text-[11.5px] text-ink-muted">
                        {job.area_location} · {timeAgo(job.customer_confirmed_at || job.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-line bg-card p-2.5">
                      <p className="eyebrow text-ink-muted">Karigar</p>
                      <p className="tnum mt-0.5 text-[15px] font-bold text-ink">{pkr(tech)}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-card p-2.5">
                      <p className="eyebrow text-ink-muted">Customer</p>
                      <p className="tnum mt-0.5 text-[15px] font-bold text-ink">{pkr(cust)}</p>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <Chip tone="alert">
                      Farq <span className="tnum">{pkr(gap)}</span>
                    </Chip>
                    {job.commission_charged != null && (
                      <Chip tone="royal">
                        Commission <span className="tnum">{pkr(job.commission_charged)}</span>
                      </Chip>
                    )}
                    {job.customer_name && <Chip>{job.customer_name}</Chip>}
                  </div>
                </article>
              )
            })
          )}
        </>
      )}

      {tab === 'strikes' && (
        <>
          <Button variant="outline" size="sm" full onClick={sweep}>
            Purane unconfirmed kaam band karein
          </Button>

          {strikes.length === 0 ? (
            <p className="card p-4 text-center text-[13px] text-ink-soft">Koi strike nahi.</p>
          ) : (
            strikes.map((s) => (
              <article
                key={s.id}
                className={`card p-3.5 ${s.is_void ? 'opacity-60' : 'border-alert/30'}`}
              >
                <div className="flex items-start gap-2">
                  <ShieldOff
                    className={`mt-0.5 w-4 h-4 shrink-0 ${s.is_void ? 'text-ink-muted' : 'text-alert'}`}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">
                        {s.technician_name}
                      </h3>
                      <Chip tone={s.is_void ? 'neutral' : 'alert'}>
                        {s.is_void ? 'Void' : `Strike ${s.level}`}
                      </Chip>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">{s.reason}</p>
                    <p className="mt-1 text-[11.5px] text-ink-muted">
                      {timeAgo(s.created_at)}
                      {Number(s.fine_amount) > 0 && (
                        <>
                          {' · '}
                          <span className="tnum">{pkr(s.fine_amount)}</span> fine
                        </>
                      )}
                    </p>
                    {s.is_void && s.void_reason && (
                      <p className="mt-1 text-[11.5px] italic text-ink-muted">{s.void_reason}</p>
                    )}
                  </div>
                </div>

                {!s.is_void && (
                  <Button
                    variant="outline"
                    size="sm"
                    full
                    className="mt-3"
                    onClick={() => voidStrike(s)}
                  >
                    <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Strike hataayen (fine wapas)
                  </Button>
                )}
              </article>
            ))
          )}
        </>
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, MapPin, Search, ShieldCheck, ShieldOff, Star, Undo2, Wallet } from 'lucide-react'
import CategoryIcon from '../CategoryIcon'
import BanSheet from './BanSheet'
import { Button, Chip, Field, Input, Loading, Sheet, useToast } from '../ui'
import { admin } from '../../lib/db'
import { initials, pkr, prettyPhone } from '../../lib/format'

const TOPUPS = [200, 500, 1000]

/** Karigar management: verify the CNIC badge, credit a wallet against a
 *  received payment, or ban the account. */
export default function AdminKarigars() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [banTarget, setBanTarget] = useState(null)
  const [walletTarget, setWalletTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await admin.listTechnicians())
    } catch {
      toast('Could not load karigars', 'alert')
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
      [r.full_name, r.shop_name, r.address_area, r.category_name, r.phone_number]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q)),
    )
  }, [rows, query])

  async function toggleVerified(row) {
    try {
      await admin.setVerified(row.id, !row.is_verified)
      toast(row.is_verified ? 'Verified badge removed' : 'Marked CNIC verified', 'success')
      load()
    } catch {
      toast('Could not update the badge', 'alert')
    }
  }

  async function confirmBan(target, banned, reason) {
    try {
      await admin.setBan(target.userId, banned, reason)
      toast(banned ? `${target.name} is banned` : `${target.name} is restored`, banned ? 'alert' : 'success')
      load()
    } catch (err) {
      toast(err.message === 'CANNOT_BAN_SELF' ? 'You cannot ban your own account' : 'Could not update the account', 'alert')
    }
  }

  if (loading) return <Loading label="Loading karigars" />

  return (
    <div className="space-y-3">
      <SearchBar value={query} onChange={setQuery} placeholder="Name, shop, area or number" />

      {visible.length === 0 ? (
        <p className="card p-4 text-center text-[13px] text-ink-soft">No karigar matches that search.</p>
      ) : (
        visible.map((row) => (
          <article key={row.id} className={`card p-3.5 ${row.is_banned ? 'border-alert/30 bg-alert-wash' : ''}`}>
            <div className="flex gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-royal-wash text-[14px] font-bold text-royal">
                {initials(row.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-[14.5px] font-bold leading-tight text-ink">
                    {row.shop_name || row.full_name}
                  </h3>
                  <span className="tnum flex shrink-0 items-center gap-0.5 text-[12.5px] font-bold text-ink">
                    <Star className="w-3 h-3 fill-amber text-amber" aria-hidden="true" />
                    {row.rating.toFixed(1)}
                  </span>
                </div>
                <p className="truncate text-[12.5px] text-ink-soft">{row.full_name}</p>
                <p className="tnum text-[12.5px] text-ink-soft">{prettyPhone(row.phone_number)}</p>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {row.is_banned && <Chip tone="alert">Banned</Chip>}
                  <Chip tone={row.is_verified ? 'success' : 'neutral'}>
                    {row.is_verified ? 'Verified' : 'Unverified'}
                  </Chip>
                  {row.category_name && (
                    <Chip tone="royal">
                      <CategoryIcon name={row.icon_name} className="w-3 h-3" strokeWidth={2.2} />
                      {row.category_name}
                    </Chip>
                  )}
                  <Chip>
                    <MapPin className="w-3 h-3" aria-hidden="true" />
                    {row.address_area}
                  </Chip>
                  <Chip tone="amber">
                    <Wallet className="w-3 h-3" aria-hidden="true" />
                    <span className="tnum">{pkr(row.wallet_balance)}</span>
                  </Chip>
                </div>

                {row.is_banned && row.banned_reason && (
                  <p className="mt-1.5 text-[11.5px] italic text-alert">Reason: {row.banned_reason}</p>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
              <Button variant="outline" size="sm" onClick={() => toggleVerified(row)}>
                {row.is_verified ? (
                  <ShieldOff className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {row.is_verified ? 'Unverify' : 'Verify'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWalletTarget(row)}>
                <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                Wallet
              </Button>
              <Button
                variant={row.is_banned ? 'success' : 'alert'}
                size="sm"
                onClick={() =>
                  setBanTarget({
                    id: row.id,
                    userId: row.user_id,
                    name: row.shop_name || row.full_name,
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
                {row.is_banned ? 'Restore' : 'Ban'}
              </Button>
            </div>
          </article>
        ))
      )}

      <BanSheet target={banTarget} onClose={() => setBanTarget(null)} onConfirm={confirmBan} />
      <WalletSheet
        target={walletTarget}
        onClose={() => setWalletTarget(null)}
        onDone={load}
        toast={toast}
      />
    </div>
  )
}

export function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 w-[18px] h-[18px] -translate-y-1/2 text-ink-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="tap w-full rounded-2xl border border-line bg-card py-3 pl-11 pr-4 text-[15px]
          focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/20"
      />
    </div>
  )
}

/** Credits a wallet against a payment that already arrived on JazzCash or
 *  EasyPaisa. The reference field is the receipt TID — without it there is no
 *  way to reconcile a disputed top-up later. */
function WalletSheet({ target, onClose, onDone, toast }) {
  const [amount, setAmount] = useState('500')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (target) {
      setAmount('500')
      setReference('')
    }
  }, [target])

  if (!target) return null

  async function submit() {
    const value = Number(amount)
    if (!value) return
    setBusy(true)
    try {
      const balance = await admin.creditWallet(target.id, value, reference.trim() || null)
      toast(`Wallet updated — new balance ${pkr(balance)}`, 'success')
      onDone()
      onClose()
    } catch {
      toast('Could not update the wallet', 'alert')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Adjust wallet"
      subtitle={`${target.shop_name || target.full_name} · currently ${pkr(target.wallet_balance)}`}
    >
      <div className="space-y-4 pb-2">
        <div className="grid grid-cols-3 gap-2">
          {TOPUPS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAmount(String(a))}
              className={`tnum tap rounded-2xl border py-3 text-[14px] font-bold press
                ${Number(amount) === a ? 'border-royal bg-royal text-white' : 'border-line bg-card text-ink'}`}
            >
              {pkr(a)}
            </button>
          ))}
        </div>

        <Field label="Amount" hint="Negative to deduct">
          <Input
            type="number"
            inputMode="numeric"
            step="10"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <Field label="Receipt reference" hint="JazzCash / EasyPaisa TID">
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. 4429183726"
            maxLength={60}
          />
        </Field>

        <p className="rounded-2xl border border-line bg-canvas px-3.5 py-3 text-[12px] leading-relaxed text-ink-soft">
          This writes a wallet ledger entry, so the change is auditable. Credit only after you have
          confirmed the payment arrived.
        </p>

        <Button variant="primary" size="lg" full loading={busy} onClick={submit}>
          {Number(amount) < 0 ? 'Deduct' : 'Credit'} {pkr(Math.abs(Number(amount) || 0))}
        </Button>
      </div>
    </Sheet>
  )
}

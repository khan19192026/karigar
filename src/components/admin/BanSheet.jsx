import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button, Field, Input, Sheet } from '../ui'
import { prettyPhone } from '../../lib/format'

const REASONS = [
  'Fake or duplicate account',
  'Abusive behaviour towards a customer',
  'Took payment and did not do the work',
  'Posting fake jobs',
  'Sharing contact details to bypass the app',
]

/**
 * Ban confirmation. A ban is reversible but consequential, so this insists
 * on a reason before it will proceed — the next admin to look at the account
 * needs to know why, and "someone banned them" is not an answer.
 *
 * `target` is { id, name, phone, isBanned }. Unbanning skips the reason.
 */
export default function BanSheet({ target, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const open = Boolean(target)
  const unbanning = target?.isBanned

  useEffect(() => {
    if (open) {
      setReason('')
      setBusy(false)
    }
  }, [open, target?.id])

  async function submit() {
    if (!unbanning && !reason.trim()) return
    setBusy(true)
    try {
      await onConfirm(target, !unbanning, reason.trim())
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={unbanning ? 'Restore this account?' : 'Ban this account?'}
      subtitle={`${target.name}${target.phone ? ` · ${prettyPhone(target.phone)}` : ''}`}
    >
      <div className="space-y-4 pb-2">
        {unbanning ? (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            They will be able to sign in, appear in the directory and post or take jobs again. Jobs
            cancelled by the ban are not restored.
          </p>
        ) : (
          <>
            <div className="flex items-start gap-2.5 rounded-2xl border border-alert/20 bg-alert-wash p-3.5">
              <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0 text-alert" aria-hidden="true" />
              <div className="text-[12.5px] leading-relaxed text-ink-soft">
                They will be signed out of the app, removed from the directory, and blocked from
                posting or unlocking jobs. Any open jobs they posted will be cancelled.
                <span className="mt-1 block font-semibold text-ink">
                  Their wallet balance is kept, and the ban can be lifted at any time.
                </span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink-soft">
                Reason <span className="text-alert">*</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`rounded-full border px-3 py-2 text-left text-[12px] font-semibold press
                      ${reason === r ? 'border-royal bg-royal text-white' : 'border-line bg-card text-ink-soft'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Or write your own" hint="Saved on the account">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What happened?"
                maxLength={140}
              />
            </Field>
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={unbanning ? 'success' : 'alert'}
            onClick={submit}
            loading={busy}
            disabled={!unbanning && !reason.trim()}
          >
            {unbanning ? 'Restore account' : 'Ban account'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

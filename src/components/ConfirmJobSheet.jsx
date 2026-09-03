import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { Button, Field, Input, Sheet, useToast } from './ui'
import { confirmJob } from '../lib/db'
import { pkr } from '../lib/format'

/**
 * The customer half of the dual confirmation.
 *
 * The amount is required and the rating is not, because the amount is what
 * the audit needs and a forced rating is a meaningless rating.
 *
 * The karigar's reported figure is deliberately NOT shown: if the customer
 * could see it they would just agree with it, and the cross-check would
 * confirm nothing.
 */
export default function ConfirmJobSheet({ job, onClose, onDone }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [rating, setRating] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setAmount('')
    setRating(0)
  }, [job?.id])

  if (!job) return null

  async function submit() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value < 0) {
      toast('Kitne paise diye? Raqam daalein.', 'alert')
      return
    }
    setBusy(true)
    try {
      await confirmJob(job.id, value, rating || null)
      toast('Shukriya — kaam band kar diya gaya', 'success')
      onDone?.()
      onClose()
    } catch (err) {
      toast(
        err.message === 'JOB_NOT_AWAITING'
          ? 'Yeh kaam pehle hi band ho chuka hai'
          : 'Save nahi hua. Dobara koshish karein.',
        'alert',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Kya ${job.technician_name || 'karigar'} ne kaam mukammal kiya?`}
      subtitle={job.title}
    >
      <div className="space-y-4 pb-2">
        <Field label="Aap ne kitne paise diye?" required hint="PKR — zaroori hai">
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            step="50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="2000"
            autoFocus
          />
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-soft">
            Kaam kaisa tha? <span className="font-normal text-ink-muted">— marzi se</span>
          </p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(rating === n ? 0 : n)}
                aria-label={`${n} out of 5`}
                aria-pressed={rating >= n}
                className="tap grid flex-1 place-items-center rounded-xl border border-line bg-card press"
              >
                <Star
                  className={`w-6 h-6 ${rating >= n ? 'fill-amber text-amber' : 'text-ink-muted'}`}
                  strokeWidth={1.8}
                />
              </button>
            ))}
          </div>
        </div>

        <p className="rounded-2xl border border-line bg-canvas px-3.5 py-3 text-[12px] leading-relaxed text-ink-soft">
          Sach likhein. Yeh raqam sirf hisaab ke liye hai — karigar ko nazar nahi aati, aur aap se
          koi paisa nahi liya jayega.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            Baad mein
          </Button>
          <Button variant="success" loading={busy} onClick={submit}>
            Tasdeeq karein
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

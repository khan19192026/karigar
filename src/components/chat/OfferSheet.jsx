import { useEffect, useState } from 'react'
import { Handshake } from 'lucide-react'
import { Button, Field, Input, Sheet, Textarea, useToast } from '../ui'
import { pkr } from '../../lib/format'

const PRESETS = [500, 1000, 2000, 5000]

/**
 * Sends a price offer into the thread.
 *
 * Either side can send one. The amount is the thing that gets locked onto
 * the job when the other party accepts, so the warning about that is stated
 * plainly rather than buried — once accepted, the price is the record used by
 * the completion audit.
 */
export default function OfferSheet({ open, onClose, onSend }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setAmount('')
      setDescription('')
    }
  }, [open])

  async function submit() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      toast('Sahi raqam daalein', 'alert')
      return
    }
    setBusy(true)
    try {
      await onSend({ amount: value, description: description.trim() || null })
      onClose()
    } catch (err) {
      toast(
        err.message === 'INVALID_AMOUNT' ? 'Sahi raqam daalein' : 'Offer nahi gaya',
        'alert',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Price offer bhejein"
      subtitle="Doosra banda manzoor kare to yehi qeemat pakki ho jayegi"
    >
      <div className="space-y-4 pb-2">
        <Field label="Raqam" required hint="PKR">
          <Input
            type="number"
            inputMode="numeric"
            min="1"
            step="50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="2000"
            autoFocus
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAmount(String(a))}
              className={`tnum rounded-full border px-3 py-2 text-[12.5px] font-semibold press
                ${Number(amount) === a ? 'border-royal bg-royal text-white' : 'border-line bg-card text-ink-soft'}`}
            >
              {pkr(a)}
            </button>
          ))}
        </div>

        <Field label="Kaam ki tafseel" hint="Marzi se">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="AC service + gas refill"
            maxLength={300}
          />
        </Field>

        <p className="flex items-start gap-2.5 rounded-2xl border border-amber/30 bg-amber-wash p-3.5 text-[12.5px] leading-relaxed text-ink-soft">
          <Handshake className="mt-0.5 w-4 h-4 shrink-0 text-amber-deep" aria-hidden="true" />
          <span>
            <span className="font-bold text-ink">Manzoori ke baad qeemat lock ho jayegi.</span> Kaam
            khatam hone par dono se yehi raqam poochi jayegi — isliye wohi likhein jo tay hui hai.
          </span>
        </p>

        <Button variant="action" size="lg" full loading={busy} onClick={submit}>
          Offer bhejein
        </Button>
      </div>
    </Sheet>
  )
}

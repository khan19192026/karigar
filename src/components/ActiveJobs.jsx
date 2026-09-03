import { useState } from 'react'
import { CheckCircle2, Clock, MapPin, Phone } from 'lucide-react'
import CategoryIcon from './CategoryIcon'
import { Button, Chip, Field, Input, Sheet, useToast } from './ui'
import { finishJob } from '../lib/db'
import { pkr, prettyPhone, telHref, timeAgo } from '../lib/format'

/**
 * The karigar's jobs in hand.
 *
 * "Kaam mukammal" is what releases the unconfirmed-job lock, so this block
 * sits above the lead list — it is the thing standing between the karigar
 * and their next job.
 */
export default function ActiveJobs({ jobs, contacts, onChanged }) {
  const [finishing, setFinishing] = useState(null)

  if (jobs.length === 0) return null

  const assigned = jobs.filter((j) => j.status === 'assigned')
  const waiting = jobs.filter((j) => j.status === 'awaiting_confirmation')

  return (
    <section className="px-5 pt-4" aria-labelledby="active-jobs-heading">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="active-jobs-heading" className="text-[15px] font-extrabold tracking-tight text-ink">
          Aap ke haath mein kaam
        </h2>
        <span className="tnum text-[12px] font-semibold text-ink-soft">
          {assigned.length} chal raha
        </span>
      </div>

      <ul className="space-y-3">
        {assigned.map((job) => (
          <li key={job.id} className="card border-royal/30 p-3.5">
            <JobHead job={job} />
            <ContactRow contact={contacts?.[job.id]} />
            <Button
              variant="success"
              size="md"
              full
              className="mt-3"
              onClick={() => setFinishing(job)}
            >
              <CheckCircle2 className="w-4 h-4" strokeWidth={2.4} />
              Kaam mukammal — status daalein
            </Button>
          </li>
        ))}

        {waiting.map((job) => (
          <li key={job.id} className="card p-3.5">
            <JobHead job={job} />
            <div className="mt-3 flex items-start gap-2 border-t border-line pt-3">
              <Clock className="mt-0.5 w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <p className="text-[12px] leading-relaxed text-ink-soft">
                Aap ne <span className="tnum font-bold text-ink">{pkr(job.technician_amount)}</span>{' '}
                report kiya. Customer ki tasdeeq ka intezar hai — yeh kaam aap ki limit mein nahi
                ginta, aap nayi leads le sakte hain.
              </p>
            </div>
          </li>
        ))}
      </ul>

      <FinishSheet
        job={finishing}
        onClose={() => setFinishing(null)}
        onDone={onChanged}
      />
    </section>
  )
}

function JobHead({ job }) {
  return (
    <>
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-royal-wash text-royal">
          <CategoryIcon name={job.icon_name} className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-bold leading-snug text-ink">{job.title}</h3>
          <p className="text-[11.5px] text-ink-muted">
            {job.category_name} · liya {timeAgo(job.assigned_at || job.created_at)}
          </p>
        </div>
        {job.proposed_budget != null && (
          <Chip tone="amber">
            <span className="tnum">{pkr(job.proposed_budget)}</span>
          </Chip>
        )}
      </div>
      <div className="mt-2">
        <Chip>
          <MapPin className="w-3 h-3" aria-hidden="true" />
          {job.area_location}
        </Chip>
      </div>
    </>
  )
}

function ContactRow({ contact }) {
  if (!contact?.phone_number) return null
  return (
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold text-ink">{contact.full_name}</p>
        <p className="tnum text-[12.5px] text-ink-soft">{prettyPhone(contact.phone_number)}</p>
      </div>
      <Button as="a" href={telHref(contact.phone_number)} variant="primary" size="sm">
        <Phone className="w-4 h-4" strokeWidth={2.4} />
        Call
      </Button>
    </div>
  )
}

/**
 * Reporting the final amount. The warning is blunt on purpose: the customer
 * is asked the same question, and a gap beyond the tolerance costs a strike.
 * Telling the karigar that up front is what makes the audit fair.
 */
function FinishSheet({ job, onClose, onDone }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  if (!job) return null

  async function submit() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value < 0) {
      toast('Sahi raqam daalein', 'alert')
      return
    }
    setBusy(true)
    try {
      await finishJob(job.id, value)
      toast('Kaam mukammal — customer ki tasdeeq ka intezar', 'success')
      onDone?.()
      onClose()
    } catch (err) {
      toast(
        err.message === 'JOB_NOT_ASSIGNED_TO_YOU'
          ? 'Yeh kaam aap ke naam par nahi hai'
          : 'Status save nahi hua. Dobara koshish karein.',
        'alert',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Kaam mukammal" subtitle={job.title}>
      <div className="space-y-4 pb-2">
        <Field label="Customer se kitne paise liye?" required hint="PKR">
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            step="50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={String(job.proposed_budget || 1000)}
            autoFocus
          />
        </Field>

        <div className="flex items-start gap-2.5 rounded-2xl border border-amber/30 bg-amber-wash p-3.5">
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            <span className="font-bold text-ink">Sahi raqam likhein.</span> Customer se bhi yehi
            sawal poocha jayega. Agar dono jawab bohat mukhtalif hon, tou aap ko strike lag sakti
            hai.
          </p>
        </div>

        <Button variant="success" size="lg" full loading={busy} onClick={submit}>
          Status confirm karein
        </Button>
      </div>
    </Sheet>
  )
}

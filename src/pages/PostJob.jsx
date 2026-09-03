import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CheckCircle2, Send, ShieldAlert } from 'lucide-react'
import VoiceRecorder from '../components/VoiceRecorder'
import CategoryIcon from '../components/CategoryIcon'
import { Button, Field, Input, Select, Textarea, useToast } from '../components/ui'
import { AREAS } from '../lib/constants'
import { createRequest, listCategories } from '../lib/db'
import { useSession } from '../store/session'
import { maskPhoneNumbers, pkr } from '../lib/format'

const BUDGET_PRESETS = [500, 1000, 2000, 5000]

/**
 * The job posting form. Kept to one screen with no steps, because every
 * extra tap between "my AC is dead" and "someone will call me" costs a job.
 */
export default function PostJob() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile, loading, isTechnician } = useSession()

  const [categories, setCategories] = useState([])
  const [audioBlob, setAudioBlob] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [form, setForm] = useState({
    category_id: '',
    title: '',
    description: '',
    area_location: '',
    proposed_budget: '',
  })

  useEffect(() => {
    listCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  if (!loading && !profile) return <Navigate to="/onboarding" replace />

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((x) => ({ ...x, [key]: undefined }))
  }

  function validate() {
    const next = {}
    if (!form.category_id) next.category_id = 'Choose the kind of work'
    if (!form.title.trim()) next.title = 'Describe the problem in a few words'
    if (!form.area_location) next.area_location = 'Choose your area'
    if (form.proposed_budget && Number(form.proposed_budget) < 0) {
      next.proposed_budget = 'Enter a positive amount'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(e) {
    e.preventDefault()
    if (!validate()) return
    setBusy(true)
    try {
      await createRequest({ ...form, title: form.title.trim(), audioBlob })
      toast('Job posted — karigars in your area can see it now', 'success')
      navigate('/me', { replace: true })
    } catch (err) {
      toast(
        err.message === 'STORAGE_FULL'
          ? 'This device is out of storage. Delete the voice note and post again.'
          : 'Could not post the job. Check your connection and try again.',
        'alert',
      )
    } finally {
      setBusy(false)
    }
  }

  const selected = categories.find((c) => c.id === form.category_id)

  // Warn as they type rather than quietly editing their words after they
  // hit post. The number is removed either way — see maskPhoneNumbers.
  const typedANumber =
    maskPhoneNumbers(form.title).found || maskPhoneNumbers(form.description).found

  return (
    <div className="pb-6">
      <header className="bg-royal px-5 pb-6 pt-5 text-white">
        <p className="eyebrow text-amber">Post a job</p>
        <h1 className="mt-1.5 text-[24px] font-extrabold leading-tight tracking-tight">
          Masla batayen, karigar khud raabta karega.
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-white/75">
          Describe the problem once. Verified karigars in your area will see it and call you.
        </p>
      </header>

      {isTechnician && (
        <p className="mx-5 mt-4 rounded-2xl border border-amber/25 bg-amber-wash px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-deep">
          You are signed in as a karigar. Posting here creates a customer job request — your own leads
          are under the Leads tab.
        </p>
      )}

      <form onSubmit={submit} className="space-y-4 px-5 pt-5" noValidate>
        <Field label="What kind of work?" required error={errors.category_id}>
          <Select value={form.category_id} onChange={set('category_id')}>
            <option value="">Choose a service</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_roman ? `${c.name_roman} — ${c.name_en}` : c.name_en}
              </option>
            ))}
          </Select>
        </Field>

        {selected && (
          <div className="flex items-center gap-2 rounded-2xl bg-royal-wash px-3.5 py-2.5 text-royal">
            <CategoryIcon name={selected.icon_name} className="w-5 h-5" />
            <span className="text-[13px] font-semibold">
              Going to every {selected.name_en.toLowerCase()} in your area
            </span>
          </div>
        )}

        <Field label="Problem in short" required error={errors.title} hint="Shown as the headline">
          <Input
            value={form.title}
            onChange={set('title')}
            placeholder="Split AC not cooling"
            maxLength={90}
          />
        </Field>

        <Field label="Details" hint="Optional">
          <Textarea
            value={form.description}
            onChange={set('description')}
            placeholder="Gas leak lag raha hai. Dopehar mein aa jayen."
            maxLength={600}
          />
        </Field>

        {typedANumber && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber/30 bg-amber-wash p-3.5">
            <ShieldAlert className="mt-0.5 w-4 h-4 shrink-0 text-amber-deep" aria-hidden="true" />
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              <span className="font-bold text-ink">Apna number likhne ki zaroorat nahi.</span> Hum aap
              ka number khud karigar tak pohanchate hain jab woh aap ka kaam lay. Isay hata diya jayega.
            </p>
          </div>
        )}

        {/* Voice note — the low-literacy path. Given its own labelled block
            rather than buried as a field, because for many users it is the
            primary way to describe the job. */}
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-ink-soft">
            Voice note <span className="font-normal text-ink-muted">— optional</span>
          </p>
          <VoiceRecorder onChange={setAudioBlob} disabled={busy} />
          <p className="mt-1.5 px-1 text-[11.5px] leading-relaxed text-ink-muted">
            Voice note mein apna phone number na batayen — karigar ko woh app khud deta hai.
          </p>
        </div>

        <Field label="Your area" required error={errors.area_location}>
          <Select value={form.area_location} onChange={set('area_location')}>
            <option value="">Choose your area</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Your budget"
          hint="Optional"
          error={errors.proposed_budget}
        >
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            step="100"
            value={form.proposed_budget}
            onChange={set('proposed_budget')}
            placeholder="1000"
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          {BUDGET_PRESETS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setForm((f) => ({ ...f, proposed_budget: String(amount) }))}
              className={`tnum rounded-full border px-3 py-2 text-[12.5px] font-semibold press
                ${
                  Number(form.proposed_budget) === amount
                    ? 'border-royal bg-royal text-white'
                    : 'border-line bg-card text-ink-soft'
                }`}
            >
              {pkr(amount)}
            </button>
          ))}
        </div>

        <div className="card flex items-start gap-2.5 border-success/25 bg-success-wash p-3.5">
          <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0 text-success" aria-hidden="true" />
          <p className="text-[12px] leading-relaxed text-ink-soft">
            Your number stays hidden on the job board. A karigar sees it only after they choose to take
            your job.
          </p>
        </div>

        <Button type="submit" variant="action" size="lg" full loading={busy} className="!mt-5">
          {!busy && <Send className="w-4 h-4" strokeWidth={2.5} />}
          Post this job
        </Button>
      </form>
    </div>
  )
}

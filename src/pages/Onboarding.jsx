import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ShieldCheck, Wrench, UserRound } from 'lucide-react'
import Skyline from '../components/Skyline'
import CategoryIcon from '../components/CategoryIcon'
import { Button, Field, Input, Select, useToast } from '../components/ui'
import { AREAS, BROWSE_KEY } from '../lib/constants'
import { auth, listCategories, upsertTechnicianProfile } from '../lib/db'
import { useSession } from '../store/session'
import { formatCnic, isValidCnic, prettyPhone, toE164 } from '../lib/format'

/**
 * Two steps, never more: pick a side, then give the least information the
 * app can work with. A customer hands over a name and a number. A karigar
 * gives more, because a listing has to earn trust before it earns calls.
 */
export default function Onboarding() {
  const navigate = useNavigate()
  const toast = useToast()
  const { refresh, profile } = useSession()

  const [step, setStep] = useState('role')
  const [role, setRole] = useState(null)
  const [categories, setCategories] = useState([])
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})

  const [form, setForm] = useState({
    full_name: '',
    phone_number: '',
    shop_name: '',
    address_area: '',
    category_id: '',
    experience_years: '',
    cnic_number: '',
    whatsapp_number: '',
  })

  useEffect(() => {
    if (profile) navigate('/', { replace: true })
  }, [profile, navigate])

  useEffect(() => {
    listCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  const set = (key) => (e) => {
    const value = key === 'cnic_number' ? formatCnic(e.target.value) : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((x) => ({ ...x, [key]: undefined }))
  }

  function validate() {
    const next = {}
    if (!form.full_name.trim()) next.full_name = 'Enter your name'
    if (!toE164(form.phone_number)) next.phone_number = 'Enter a mobile number like 0300 1234567'

    if (role === 'technician') {
      if (!form.address_area) next.address_area = 'Choose your area'
      if (!form.category_id) next.category_id = 'Choose the work you do'
      if (form.cnic_number && !isValidCnic(form.cnic_number)) {
        next.cnic_number = 'A CNIC has 13 digits'
      }
      if (form.whatsapp_number && !toE164(form.whatsapp_number)) {
        next.whatsapp_number = 'Enter a mobile number like 0300 1234567'
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(e) {
    e.preventDefault()
    if (!validate()) return
    setBusy(true)
    try {
      await auth.signIn({
        phone: form.phone_number,
        full_name: form.full_name.trim(),
        role,
      })

      if (role === 'technician') {
        await upsertTechnicianProfile({
          category_id: form.category_id,
          shop_name: form.shop_name.trim(),
          address_area: form.address_area,
          experience_years: form.experience_years || 1,
          cnic_number: form.cnic_number.replace(/\D/g, '') || null,
          whatsapp_number: form.whatsapp_number || form.phone_number,
        })
      }

      await refresh()
      toast(
        role === 'technician' ? 'Your listing is live in the directory' : 'Welcome to Karigar D.I. Khan',
        'success',
      )
      navigate(role === 'technician' ? '/me' : '/', { replace: true })
    } catch (err) {
      const message =
        err.message === 'INVALID_PHONE'
          ? 'That mobile number does not look right. Try 0300 1234567.'
          : 'Could not create your account. Check your connection and try again.'
      toast(message, 'alert')
    } finally {
      setBusy(false)
    }
  }

  /* ────────────────────────────────────────────────── step 1: role ── */

  if (step === 'role') {
    return (
      <div className="min-h-dvh">
        <header className="relative overflow-hidden bg-royal pb-24 pt-10 text-white">
          <Skyline className="absolute inset-x-0 bottom-0 h-28 w-full text-white opacity-70" />
          <div className="relative px-6">
            <p className="eyebrow text-amber">Dera Ismail Khan</p>
            <h1 className="mt-2 text-[30px] font-extrabold leading-[1.1] tracking-tight">
              Ghar ka kaam,
              <br />
              bharosay ka karigar.
            </h1>
            <p className="mt-3 max-w-[19rem] text-[14px] leading-relaxed text-white/80">
              CNIC-verified electricians, plumbers and AC technicians from your own mohalla — reachable
              in one call.
            </p>
          </div>
        </header>

        {/* relative + z-10: the skyline is absolutely positioned, so without
            a stacking context of its own this content paints underneath it. */}
        <div className="relative z-10 -mt-10 px-5">
          <div className="space-y-3">
            <RoleCard
              icon={UserRound}
              title="I need a service"
              subtitle="Customer"
              body="Browse verified karigars near you, or post a job and let them call you."
              onClick={() => {
                setRole('customer')
                setStep('details')
              }}
            />
            <RoleCard
              icon={Wrench}
              tone="amber"
              title="I am a skilled karigar"
              subtitle="Technician"
              body="List your shop, get job leads from across D.I. Khan, and grow your customers."
              onClick={() => {
                setRole('technician')
                setStep('details')
              }}
            />
          </div>

          <p className="mt-6 flex items-start gap-2 px-1 text-[12px] leading-relaxed text-ink-muted">
            <ShieldCheck className="mt-0.5 w-4 h-4 shrink-0 text-success" aria-hidden="true" />
            Your number is shared with a karigar only when you ask them to call, or when you post a job.
          </p>

          {/* Looking up a plumber should not require signing up. An account
              is only needed to post a job or receive leads. */}
          <button
            type="button"
            onClick={() => {
              sessionStorage.setItem(BROWSE_KEY, '1')
              navigate('/', { replace: true })
            }}
            className="tap mt-2 w-full pb-8 text-center text-[13px] font-bold text-royal"
          >
            Browse karigars without an account
          </button>
        </div>
      </div>
    )
  }

  /* ─────────────────────────────────────────────── step 2: details ── */

  const isTech = role === 'technician'

  return (
    <div className="min-h-dvh pb-10">
      <header className="flex items-center gap-3 border-b border-line bg-card px-4 py-3">
        <button
          type="button"
          onClick={() => setStep('role')}
          aria-label="Go back to role selection"
          className="tap -ml-2 grid place-items-center rounded-full text-ink-soft hover:bg-canvas"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-[16px] font-bold leading-tight text-ink">
            {isTech ? 'List your shop' : 'Create your account'}
          </h1>
          <p className="text-[12px] text-ink-soft">
            {isTech ? 'Takes about a minute' : 'Just two details to start'}
          </p>
        </div>
      </header>

      <form onSubmit={submit} className="space-y-4 px-5 pt-5" noValidate>
        <Field label="Full name" required error={errors.full_name}>
          <Input
            value={form.full_name}
            onChange={set('full_name')}
            placeholder="Muhammad Ashraf"
            autoComplete="name"
            enterKeyHint="next"
          />
        </Field>

        <Field
          label="Mobile number"
          required
          error={errors.phone_number}
          hint={toE164(form.phone_number) ? prettyPhone(form.phone_number) : 'Pakistani mobile'}
        >
          <Input
            type="tel"
            inputMode="numeric"
            value={form.phone_number}
            onChange={set('phone_number')}
            placeholder="0300 1234567"
            autoComplete="tel"
            enterKeyHint={isTech ? 'next' : 'done'}
          />
        </Field>

        {isTech && (
          <>
            <Field label="Shop name" hint="Optional">
              <Input
                value={form.shop_name}
                onChange={set('shop_name')}
                placeholder="Ashraf Cooling Centre"
              />
            </Field>

            <Field label="What work do you do?" required error={errors.category_id}>
              <Select value={form.category_id} onChange={set('category_id')}>
                <option value="">Choose your trade</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_roman ? `${c.name_roman} — ${c.name_en}` : c.name_en}
                  </option>
                ))}
              </Select>
            </Field>

            {form.category_id && (
              <div className="flex items-center gap-2 rounded-2xl bg-royal-wash px-3 py-2.5 text-royal">
                <CategoryIcon
                  name={categories.find((c) => c.id === form.category_id)?.icon_name}
                  className="w-5 h-5"
                />
                <span className="text-[13px] font-semibold">
                  Customers will find you under{' '}
                  {categories.find((c) => c.id === form.category_id)?.name_en}
                </span>
              </div>
            )}

            <Field label="Your area" required error={errors.address_area}>
              <Select value={form.address_area} onChange={set('address_area')}>
                <option value="">Choose your area</option>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Experience" hint="Years">
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="60"
                  value={form.experience_years}
                  onChange={set('experience_years')}
                  placeholder="8"
                />
              </Field>
              <Field label="WhatsApp" hint="If different" error={errors.whatsapp_number}>
                <Input
                  type="tel"
                  inputMode="numeric"
                  value={form.whatsapp_number}
                  onChange={set('whatsapp_number')}
                  placeholder="Same as mobile"
                />
              </Field>
            </div>

            <Field
              label="CNIC number"
              hint="Optional"
              error={errors.cnic_number}
            >
              <Input
                inputMode="numeric"
                value={form.cnic_number}
                onChange={set('cnic_number')}
                placeholder="12345-1234567-1"
                maxLength={15}
              />
            </Field>

            <p className="flex items-start gap-2 rounded-2xl border border-line bg-card px-3.5 py-3 text-[12px] leading-relaxed text-ink-soft">
              <ShieldCheck className="mt-0.5 w-4 h-4 shrink-0 text-royal" aria-hidden="true" />
              Add your CNIC to get the verified badge. Our team checks it by phone within two working
              days, and it is never shown to customers.
            </p>
          </>
        )}

        <Button type="submit" variant="action" size="lg" full loading={busy} className="!mt-6">
          {isTech ? 'Publish my listing' : 'Start finding karigars'}
          {!busy && <ArrowRight className="w-4 h-4" strokeWidth={2.5} />}
        </Button>
      </form>
    </div>
  )
}

function RoleCard({ icon: Icon, title, subtitle, body, tone = 'royal', onClick }) {
  const accent = tone === 'amber' ? 'bg-amber text-ink' : 'bg-royal text-white'
  return (
    <button
      type="button"
      onClick={onClick}
      className="card press flex w-full items-start gap-3.5 p-4 text-left shadow-sm"
    >
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${accent}`}>
        <Icon className="w-6 h-6" strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block text-ink-muted">{subtitle}</span>
        <span className="mt-0.5 block text-[16px] font-bold leading-tight text-ink">{title}</span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-soft">{body}</span>
      </span>
      <ArrowRight className="mt-1 w-5 h-5 shrink-0 text-ink-muted" aria-hidden="true" />
    </button>
  )
}

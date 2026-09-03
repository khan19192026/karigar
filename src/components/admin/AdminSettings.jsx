import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { Button, Field, Input, Loading, useToast } from '../ui'
import { getConfig, isDemo, setConfig } from '../../lib/db'
import { useSession } from '../../store/session'
import { pkr } from '../../lib/format'

/**
 * Remote configuration. The monetization toggle is the lever the whole
 * business runs on, so it gets a plain-language consequence line rather than
 * a bare switch — whoever flips it should see exactly what changes.
 */
export default function AdminSettings() {
  const toast = useToast()
  const { isAdmin, refresh } = useSession()
  const [values, setValues] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getConfig().then((cfg) =>
      setValues({
        monetization_active: cfg.monetization_active === true || cfg.monetization_active === 'true',
        lead_unlock_cost: Number(cfg.lead_unlock_cost) || 0,
        free_leads_allowance: Number(cfg.free_leads_allowance) || 0,
        support_whatsapp: String(cfg.support_whatsapp || '').replace(/"/g, ''),
        commission_active: cfg.commission_active === true || cfg.commission_active === 'true',
        commission_percent: Number(cfg.commission_percent) || 0,
        discrepancy_tolerance_percent: Number(cfg.discrepancy_tolerance_percent) || 0,
        max_unconfirmed_jobs: Number(cfg.max_unconfirmed_jobs) || 2,
        confirmation_timeout_days: Number(cfg.confirmation_timeout_days) || 7,
        strike2_fine: Number(cfg.strike2_fine) || 0,
        directory_charge_active:
          cfg.directory_charge_active === true || cfg.directory_charge_active === 'true',
        directory_contact_cost: Number(cfg.directory_contact_cost) || 0,
        contact_dedupe_days: Number(cfg.contact_dedupe_days) || 7,
      }),
    )
  }, [])

  if (!values) return <Loading />

  async function save() {
    setBusy(true)
    try {
      await Promise.all([
        setConfig('monetization_active', values.monetization_active),
        setConfig('lead_unlock_cost', Number(values.lead_unlock_cost)),
        setConfig('free_leads_allowance', Number(values.free_leads_allowance)),
        setConfig('support_whatsapp', values.support_whatsapp),
        setConfig('commission_active', values.commission_active),
        setConfig('commission_percent', Number(values.commission_percent)),
        setConfig('discrepancy_tolerance_percent', Number(values.discrepancy_tolerance_percent)),
        setConfig('max_unconfirmed_jobs', Number(values.max_unconfirmed_jobs)),
        setConfig('confirmation_timeout_days', Number(values.confirmation_timeout_days)),
        setConfig('strike2_fine', Number(values.strike2_fine)),
        setConfig('directory_charge_active', values.directory_charge_active),
        setConfig('directory_contact_cost', Number(values.directory_contact_cost)),
        setConfig('contact_dedupe_days', Number(values.contact_dedupe_days)),
      ])
      await refresh()
      toast('Settings saved — live for every karigar now', 'success')
    } catch {
      toast('Could not save. Your account may not have admin rights.', 'alert')
    } finally {
      setBusy(false)
    }
  }

  const set = (key) => (e) =>
    setValues((v) => ({ ...v, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <div className="space-y-4">
      <div className={`card p-4 transition-colors ${values.monetization_active ? 'border-amber/40 bg-amber-wash' : ''}`}>
        <label className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[15px] font-bold text-ink">Charge for leads</span>
            <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-soft">
              {values.monetization_active
                ? `A karigar spends ${pkr(values.lead_unlock_cost)} to see a customer's number, after ${values.free_leads_allowance} free leads.`
                : 'Every customer contact is free. Karigars keep their balance and nothing is deducted.'}
            </span>
          </span>

          <span className="relative shrink-0">
            <input
              type="checkbox"
              role="switch"
              checked={values.monetization_active}
              onChange={set('monetization_active')}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="block h-7 w-12 cursor-pointer rounded-full bg-line transition-colors
                peer-checked:bg-success peer-focus-visible:outline peer-focus-visible:outline-2
                peer-focus-visible:outline-offset-2 peer-focus-visible:outline-royal"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-card shadow
                transition-transform peer-checked:translate-x-5"
            />
          </span>
        </label>
      </div>

      <Field label="Cost per lead" hint="PKR">
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          step="5"
          value={values.lead_unlock_cost}
          onChange={set('lead_unlock_cost')}
        />
      </Field>

      <Field label="Free leads for a new karigar" hint="Before charging starts">
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={values.free_leads_allowance}
          onChange={set('free_leads_allowance')}
        />
      </Field>

      {/* Directory reveals. Priced above a job-board lead because the
          customer picked this karigar by name. */}
      <div className={`card p-4 transition-colors ${values.directory_charge_active ? 'border-amber/40 bg-amber-wash' : ''}`}>
        <label className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[15px] font-bold text-ink">Directory contact charge</span>
            <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-soft">
              {values.directory_charge_active
                ? `Customer jab directory se "Contact" dabaye, karigar ke wallet se ${pkr(values.directory_contact_cost)} katega. Jis karigar ke paas itna balance na ho, woh "available nahi" dikhega.`
                : 'Directory se contact kholna muft hai — kisi karigar se kuch nahi katega.'}
            </span>
          </span>
          <span className="relative shrink-0">
            <input
              type="checkbox"
              role="switch"
              checked={values.directory_charge_active}
              onChange={set('directory_charge_active')}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="block h-7 w-12 cursor-pointer rounded-full bg-line transition-colors
                peer-checked:bg-success peer-focus-visible:outline peer-focus-visible:outline-2
                peer-focus-visible:outline-offset-2 peer-focus-visible:outline-royal"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-card shadow
                transition-transform peer-checked:translate-x-5"
            />
          </span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact ki qeemat" hint="PKR">
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            step="5"
            value={values.directory_contact_cost}
            onChange={set('directory_contact_cost')}
          />
        </Field>
        <Field label="Dobara charge" hint="Din baad">
          <Input
            type="number"
            inputMode="numeric"
            min="1"
            max="90"
            value={values.contact_dedupe_days}
            onChange={set('contact_dedupe_days')}
          />
        </Field>
      </div>

      <p className="rounded-2xl border border-line bg-canvas px-3.5 py-3 text-[12px] leading-relaxed text-ink-soft">
        Wohi customer wohi karigar dobara khole tou itne din tak muft. Isay 0 na karein — warna aik
        customer ke do tap karigar ko dugna charge kar denge.
      </p>

      {/* Commission is a separate lever from the lead fee — run either,
          both, or neither. */}
      <div className={`card p-4 transition-colors ${values.commission_active ? 'border-amber/40 bg-amber-wash' : ''}`}>
        <label className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[15px] font-bold text-ink">Job par commission</span>
            <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-soft">
              {values.commission_active
                ? `Kaam mukammal hone par job ki raqam ka ${values.commission_percent}% wallet se katega. Wallet khali ho tou balance minus mein chala jayega aur leads band ho jayengi.`
                : 'Kaam mukammal hone par kuch nahi katega. Sirf lead fee chalegi.'}
            </span>
          </span>
          <span className="relative shrink-0">
            <input
              type="checkbox"
              role="switch"
              checked={values.commission_active}
              onChange={set('commission_active')}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="block h-7 w-12 cursor-pointer rounded-full bg-line transition-colors
                peer-checked:bg-success peer-focus-visible:outline peer-focus-visible:outline-2
                peer-focus-visible:outline-offset-2 peer-focus-visible:outline-royal"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-card shadow
                transition-transform peer-checked:translate-x-5"
            />
          </span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Commission" hint="%">
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            max="100"
            value={values.commission_percent}
            onChange={set('commission_percent')}
          />
        </Field>
        <Field label="Farq ki hadd" hint="% tolerance">
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            max="100"
            value={values.discrepancy_tolerance_percent}
            onChange={set('discrepancy_tolerance_percent')}
          />
        </Field>
      </div>

      <p className="rounded-2xl border border-line bg-canvas px-3.5 py-3 text-[12px] leading-relaxed text-ink-soft">
        Isse zyada farq hone par discrepancy flag hogi aur strike lagegi. Isay zero na karein — parts
        alag khareedne ya discount dene par imaandar karigar ko bhi strike lag jayegi.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Unconfirmed jobs" hint="Phir lock">
          <Input
            type="number"
            inputMode="numeric"
            min="1"
            max="10"
            value={values.max_unconfirmed_jobs}
            onChange={set('max_unconfirmed_jobs')}
          />
        </Field>
        <Field label="Auto-close" hint="Din">
          <Input
            type="number"
            inputMode="numeric"
            min="1"
            max="60"
            value={values.confirmation_timeout_days}
            onChange={set('confirmation_timeout_days')}
          />
        </Field>
      </div>

      <Field label="Strike 2 fine" hint="PKR">
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          step="50"
          value={values.strike2_fine}
          onChange={set('strike2_fine')}
        />
      </Field>

      <Field label="Support WhatsApp number" hint="Wallet top-up receipts">
        <Input
          type="tel"
          inputMode="numeric"
          value={values.support_whatsapp}
          onChange={set('support_whatsapp')}
          placeholder="923000000000"
        />
      </Field>

      <Button variant="primary" size="lg" full loading={busy} onClick={save} className="!mt-6">
        {!busy && <Save className="w-4 h-4" strokeWidth={2.4} />}
        Save settings
      </Button>

      {isDemo && !isAdmin && (
        <p className="rounded-2xl border border-dashed border-line px-3.5 py-3 text-[12px] leading-relaxed text-ink-muted">
          Demo mode: these settings are stored on this device only. Connect Supabase and give your
          profile the admin role to manage the live app.
        </p>
      )}
    </div>
  )
}

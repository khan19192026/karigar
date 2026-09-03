import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Copy,
  Grab,
  Inbox,
  Lock,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react'
import CategoryIcon from '../components/CategoryIcon'
import ActiveJobs from '../components/ActiveJobs'
import { VoiceNotePlayer } from '../components/VoiceRecorder'
import {
  Button,
  Chip,
  EmptyState,
  Loading,
  Pill,
  Sheet,
  VerifiedBadge,
  useToast,
} from '../components/ui'
import {
  claimJob,
  closeStaleConfirmations,
  creditWalletDemo,
  getTechnicianGate,
  isDemo,
  listMyAssignedJobs,
  listMyUnlocks,
  listOpenRequests,
  listUnlockedContacts,
  unlockLead,
} from '../lib/db'
import { ensureConversation } from '../lib/chat'
import { useSession } from '../store/session'
import { BLOCK_REASONS } from '../lib/constants'
import { pkr, prettyPhone, telHref, timeAgo, whatsappHref } from '../lib/format'

const TOPUP_AMOUNTS = [200, 500, 1000]

/**
 * The karigar's side of the app: money in, leads out, jobs closed.
 *
 * A lead is deliberately shown in full — problem, area, budget, voice note —
 * before it is bought. Only the phone number is behind the paywall, so a
 * karigar can judge whether the job is worth the fee.
 */
export default function LeadCenter() {
  const navigate = useNavigate()
  const toast = useToast()
  const {
    techProfile,
    refresh,
    monetizationActive,
    leadCost,
    freeLeadsAllowance,
    supportWhatsapp,
    config,
  } = useSession()

  const [requests, setRequests] = useState([])
  const [unlocks, setUnlocks] = useState([])
  const [contacts, setContacts] = useState({})
  const [activeJobs, setActiveJobs] = useState([])
  const [gate, setGate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState('mine')
  const [pendingId, setPendingId] = useState(null)
  const [topupOpen, setTopupOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Lazily sweep jobs the customer never confirmed. In production this
      // belongs in pg_cron; here it rides along with the screen that cares.
      await closeStaleConfirmations().catch(() => 0)

      const [reqs, mine, paidFor, assigned, g] = await Promise.all([
        listOpenRequests(),
        listMyUnlocks(),
        listUnlockedContacts(),
        listMyAssignedJobs(),
        getTechnicianGate(),
      ])
      setRequests(reqs)
      setUnlocks(mine)
      setContacts((c) => ({ ...paidFor, ...c }))
      setActiveJobs(assigned)
      setGate(g)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback(async () => {
    await Promise.all([load(), refresh()])
  }, [load, refresh])

  const unlockedIds = useMemo(() => new Set(unlocks.map((u) => u.request_id)), [unlocks])
  const freeUsed = useMemo(() => unlocks.filter((u) => u.was_free).length, [unlocks])
  const freeLeft = Math.max(0, freeLeadsAllowance - freeUsed)

  const visible = useMemo(() => {
    if (scope === 'mine' && techProfile?.category_id) {
      return requests.filter((r) => r.category_id === techProfile.category_id)
    }
    return requests
  }, [requests, scope, techProfile])

  const blocked = gate?.blocked_reason || null

  function explainError(code) {
    switch (code) {
      case 'INSUFFICIENT_BALANCE':
        setTopupOpen(true)
        return 'Balance kam hai. Pehle wallet top up karein.'
      case 'NEGATIVE_BALANCE':
        setTopupOpen(true)
        return 'Wallet mein baqaya hai. Pehle woh jama karein.'
      case 'TOO_MANY_UNCONFIRMED':
        return 'Pehle purane kaam ka status daalein.'
      case 'FROZEN':
        return 'Aap ka lead access filhaal roka gaya hai.'
      case 'BANNED':
      case 'ACCOUNT_BANNED':
        return 'Aap ka account band hai.'
      case 'LEAD_NOT_UNLOCKED':
        return 'Pehle customer ka number unlock karein.'
      case 'JOB_NOT_OPEN':
        return 'Yeh kaam kisi doosre karigar ne le liya.'
      default:
        return 'Kaam nahi hua. Dobara koshish karein.'
    }
  }

  async function handleUnlock(request) {
    setPendingId(request.id)
    try {
      const result = await unlockLead(request.id)
      setContacts((c) => ({
        ...c,
        [request.id]: { full_name: result.full_name, phone_number: result.phone_number },
      }))
      await reload()
      if (result.already_unlocked) toast('Yeh number aap ke paas pehle se hai')
      else if (result.was_free) toast('Muft lead istemaal hui — number mil gaya', 'success')
      else if (result.charged > 0) toast(`${pkr(result.charged)} kate — number mil gaya`, 'success')
      else toast('Number mil gaya', 'success')
    } catch (err) {
      toast(explainError(err.message), 'alert')
    } finally {
      setPendingId(null)
    }
  }

  async function handleClaim(request) {
    setPendingId(request.id)
    try {
      await claimJob(request.id)
      await reload()
      toast('Kaam aap ke naam par ho gaya', 'success')
    } catch (err) {
      toast(explainError(err.message), 'alert')
    } finally {
      setPendingId(null)
    }
  }

  /** Chat on a lead already paid for — free, the fee was the unlock. */
  async function handleChat(request) {
    try {
      const id = await ensureConversation({
        customerId: request.customer_id,
        requestId: request.id,
      })
      navigate(`/chats/${id}`)
    } catch {
      toast('Chat nahi khul saki', 'alert')
    }
  }

  async function demoTopUp(amount) {
    try {
      await creditWalletDemo(amount)
      await reload()
      toast(`${pkr(amount)} wallet mein jama ho gaye`, 'success')
      setTopupOpen(false)
    } catch {
      toast('Top-up hamari team karti hai. Receipt WhatsApp par bhejein.', 'royal')
    }
  }

  if (!techProfile) {
    return (
      <div className="px-5 pt-6">
        <EmptyState
          icon={ShieldCheck}
          title="Apni karigar listing mukammal karein"
          body="Apna kaam aur ilaqa daalein taake customers aap ko dhoond sakein aur leads aana shuru hon."
          action={
            <Button variant="action" full onClick={() => navigate('/onboarding')}>
              Listing mukammal karein
            </Button>
          }
        />
      </div>
    )
  }

  const owes = Number(techProfile.wallet_balance) < 0

  return (
    <div className="pb-4">
      {/* ── Wallet ──────────────────────────────────────────────── */}
      <header className="bg-royal px-5 pb-6 pt-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-amber">Lead centre</p>
            <h1 className="mt-1 truncate text-[19px] font-extrabold leading-tight">
              {techProfile.shop_name || techProfile.full_name}
            </h1>
            <p className="mt-1 flex items-center gap-1 text-[12.5px] text-white/70">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              {techProfile.address_area} · {techProfile.category_name}
            </p>
          </div>
          {techProfile.is_verified && <VerifiedBadge size="lg" />}
        </div>

        <div className={`mt-4 rounded-[var(--radius-card)] p-4 ${owes ? 'bg-alert' : 'bg-white/10'}`}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow text-white/70">
                {owes ? 'Baqaya raqam' : 'Wallet balance'}
              </p>
              <p className="tnum mt-1 text-[30px] font-extrabold leading-none">
                {pkr(Math.abs(techProfile.wallet_balance))}
              </p>
            </div>
            <Button variant="action" size="sm" onClick={() => setTopupOpen(true)}>
              <Plus className="w-4 h-4" strokeWidth={2.6} />
              {owes ? 'Jama karein' : 'Top up'}
            </Button>
          </div>

          <p className="mt-3 flex items-start gap-1.5 border-t border-white/20 pt-3 text-[12px] text-white/80">
            <Sparkles className="mt-0.5 w-3.5 h-3.5 shrink-0 text-amber" aria-hidden="true" />
            <span>
              {monetizationActive && freeLeft > 0 && (
                <>
                  <span className="tnum font-bold text-white">{freeLeft}</span> muft{' '}
                  {freeLeft === 1 ? 'lead' : 'leads'} baqi, phir {pkr(leadCost)} per number.{' '}
                </>
              )}
              {monetizationActive && freeLeft === 0 && <>Har number {pkr(leadCost)} ka. </>}
              {!monetizationActive && <>Filhaal har number muft hai. </>}
              {commissionOn(config) && (
                <>Mukammal kaam par {Number(config.commission_percent) || 0}% commission katega.</>
              )}
            </span>
          </p>
        </div>
      </header>

      {/* ── Lock notice ─────────────────────────────────────────── */}
      {blocked && <LockNotice reason={blocked} gate={gate} onTopUp={() => setTopupOpen(true)} />}

      {/* ── Jobs in hand ────────────────────────────────────────── */}
      <ActiveJobs jobs={activeJobs} contacts={contacts} onChanged={reload} />

      {/* ── Scope ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 pt-5">
        <Pill active={scope === 'mine'} onClick={() => setScope('mine')}>
          Mera kaam
        </Pill>
        <Pill active={scope === 'all'} onClick={() => setScope('all')}>
          Sab kaam
        </Pill>
        {!loading && (
          <span className="tnum ml-auto text-[12.5px] font-semibold text-ink-soft">
            {visible.length} khule
          </span>
        )}
      </div>

      {/* ── Leads ───────────────────────────────────────────────── */}
      <div className="space-y-3 px-5 pt-3">
        {loading ? (
          <Loading label="Leads aa rahi hain" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={scope === 'mine' ? 'Aap ke kaam mein koi job nahi' : 'Filhaal koi khula kaam nahi'}
            body="D.I. Khan se naye kaam yahan usi waqt aa jate hain jab customer post karta hai."
            action={
              scope === 'mine' ? (
                <Button variant="outline" full onClick={() => setScope('all')}>
                  Sab kaam dikhayen
                </Button>
              ) : null
            }
          />
        ) : (
          visible.map((req, i) => (
            <LeadCard
              key={req.id}
              request={req}
              index={i}
              unlocked={unlockedIds.has(req.id)}
              contact={contacts[req.id]}
              busy={pendingId === req.id}
              blocked={blocked}
              cost={monetizationActive && freeLeft === 0 ? leadCost : 0}
              onUnlock={() => handleUnlock(req)}
              onClaim={() => handleClaim(req)}
              onChat={() => handleChat(req)}
            />
          ))
        )}
      </div>

      <TopUpSheet
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        supportWhatsapp={supportWhatsapp}
        techName={techProfile.shop_name || techProfile.full_name}
        owed={owes ? Math.abs(techProfile.wallet_balance) : 0}
        onDemoCredit={demoTopUp}
        toast={toast}
      />
    </div>
  )
}

function commissionOn(config) {
  return config?.commission_active === true || config?.commission_active === 'true'
}

/* ═══════════════════════════════════════════════════════ Lock notice ══ */

/** Says why leads are unavailable and what to do about it. A lock with no
 *  explanation reads as a broken app. */
function LockNotice({ reason, gate, onTopUp }) {
  const copy = BLOCK_REASONS[reason] || {
    title: 'Lead access band hai',
    body: 'Support se raabta karein.',
  }

  const until = gate?.frozen_until ? new Date(gate.frozen_until) : null
  const showTopUp = reason === 'NEGATIVE_BALANCE'

  return (
    <div className="mx-5 mt-4 rounded-[var(--radius-card)] border border-alert/30 bg-alert-wash p-4">
      <div className="flex items-start gap-2.5">
        <Lock className="mt-0.5 w-[18px] h-[18px] shrink-0 text-alert" strokeWidth={2.2} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-ink">{copy.title}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{copy.body}</p>

          {reason === 'TOO_MANY_UNCONFIRMED' && (
            <p className="tnum mt-1.5 text-[12px] font-semibold text-alert">
              {gate.unconfirmed_jobs} / {gate.max_unconfirmed} kaam status ke intezar mein
            </p>
          )}
          {until && (
            <p className="mt-1.5 text-[12px] font-semibold text-alert">
              {until.toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })} tak
            </p>
          )}

          {showTopUp && (
            <Button variant="alert" size="sm" className="mt-2.5" onClick={onTopUp}>
              Baqaya jama karein
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════ Lead card ══ */

function LeadCard({ request, index, unlocked, contact, busy, blocked, cost, onUnlock, onClaim, onChat }) {
  const tel = telHref(contact?.phone_number)
  const wa = whatsappHref(
    contact?.phone_number,
    `Assalam o Alaikum. Karigar D.I. Khan par aap ka kaam dekha: "${request.title}". Main aa sakta hoon.`,
  )

  return (
    <article
      className="card animate-rise p-4"
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-royal-wash text-royal">
          <CategoryIcon name={request.icon_name} className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] font-bold leading-snug text-ink">{request.title}</h2>
          <p className="text-[11.5px] text-ink-muted">
            {request.category_name} · {timeAgo(request.created_at)}
          </p>
        </div>
        {request.proposed_budget != null && (
          <Chip tone="amber">
            <span className="tnum">{pkr(request.proposed_budget)}</span>
          </Chip>
        )}
      </div>

      {request.description && (
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-soft">{request.description}</p>
      )}

      {request.audio_note_url && (
        <div className="mt-2.5">
          <VoiceNotePlayer url={request.audio_note_url} />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Chip>
          <MapPin className="w-3 h-3" aria-hidden="true" />
          {request.area_location}
        </Chip>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {unlocked || contact ? (
          <>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="eyebrow text-ink-muted">Customer</p>
                <p className="truncate text-[14px] font-bold text-ink">
                  {contact?.full_name || 'Number unlocked'}
                </p>
                {contact?.phone_number && (
                  <p className="tnum text-[13px] text-ink-soft">{prettyPhone(contact.phone_number)}</p>
                )}
              </div>
              {contact?.phone_number && <CopyButton value={prettyPhone(contact.phone_number)} />}
            </div>

            {contact?.phone_number ? (
              <div className="grid grid-cols-3 gap-2">
                <Button as="a" href={tel} variant="primary" size="sm">
                  <Phone className="w-4 h-4" strokeWidth={2.4} />
                  Call
                </Button>
                <Button as="a" href={wa} target="_blank" rel="noopener noreferrer" variant="success" size="sm">
                  WhatsApp
                </Button>
                <Button variant="outline" size="sm" onClick={() => onChat?.(request)}>
                  <MessageSquare className="w-4 h-4" strokeWidth={2.2} />
                  Chat
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" full onClick={onUnlock} loading={busy}>
                Number dobara dikhayen
              </Button>
            )}

            {/* Claiming takes the job off the board and starts the audit clock. */}
            <Button
              variant="action"
              size="md"
              full
              className="mt-2"
              loading={busy}
              disabled={Boolean(blocked)}
              onClick={onClaim}
            >
              {!busy && <Grab className="w-4 h-4" strokeWidth={2.4} />}
              Yeh kaam mai kar raha hoon
            </Button>
            {blocked === 'TOO_MANY_UNCONFIRMED' && (
              <p className="mt-1.5 flex items-start gap-1 text-[11.5px] text-alert">
                <AlertTriangle className="mt-0.5 w-3 h-3 shrink-0" aria-hidden="true" />
                Pehle purane kaam ka status daalein
              </p>
            )}
          </>
        ) : (
          <Button
            variant="action"
            size="md"
            full
            onClick={onUnlock}
            loading={busy}
            disabled={Boolean(blocked)}
          >
            {!busy && <Lock className="w-4 h-4" strokeWidth={2.4} />}
            {cost > 0 ? `Number unlock karein — ${pkr(cost)}` : 'Number unlock karein — muft'}
          </Button>
        )}
      </div>
    </article>
  )
}

function CopyButton({ value }) {
  const toast = useToast()
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          toast('Number copy ho gaya')
        } catch {
          toast('Copy nahi hua. Number ko dabaye rakhein.', 'alert')
        }
      }}
      aria-label="Customer ka number copy karein"
      className="tap grid shrink-0 place-items-center rounded-xl border border-line text-ink-soft press"
    >
      <Copy className="w-4 h-4" />
    </button>
  )
}

/* ═══════════════════════════════════════════════════════ Top-up sheet ══ */

function TopUpSheet({ open, onClose, supportWhatsapp, techName, owed, onDemoCredit, toast }) {
  const [amount, setAmount] = useState(TOPUP_AMOUNTS[1])

  useEffect(() => {
    // Default to clearing the debt exactly, rounded up to the next 100.
    if (open && owed > 0) setAmount(Math.ceil(owed / 100) * 100)
  }, [open, owed])

  const waLink = whatsappHref(
    supportWhatsapp,
    `Assalam o Alaikum. Main ${techName} hoon. Karigar wallet mein ${pkr(amount)} jama karna hai. Receipt bhej raha hoon.`,
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={owed > 0 ? 'Baqaya jama karein' : 'Wallet top up karein'}
      subtitle={
        owed > 0
          ? `${pkr(owed)} baqaya hai — jama karne par leads dobara mil jayengi.`
          : 'Raqam bhejein, phir receipt share karein — aik ghante mein jama ho jati hai.'
      }
    >
      <div className="space-y-4 pb-2">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-soft">Raqam chunein</p>
          <div className="grid grid-cols-3 gap-2">
            {TOPUP_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={`tnum tap rounded-2xl border py-3 text-[14px] font-bold press
                  ${amount === a ? 'border-royal bg-royal text-white' : 'border-line bg-card text-ink'}`}
              >
                {pkr(a)}
              </button>
            ))}
          </div>
        </div>

        <PaymentMethod brand="JazzCash" accountTitle="Karigar D.I. Khan" number="0300 0000000" tone="alert" toast={toast} />
        <PaymentMethod brand="EasyPaisa" accountTitle="Karigar D.I. Khan" number="0345 0000000" tone="success" toast={toast} />

        <ol className="space-y-2 rounded-2xl border border-line bg-canvas p-3.5 text-[12.5px] leading-relaxed text-ink-soft">
          <li className="flex gap-2">
            <span className="tnum font-bold text-royal">1.</span>
            {pkr(amount)} upar diye gaye kisi bhi number par bhejein.
          </li>
          <li className="flex gap-2">
            <span className="tnum font-bold text-royal">2.</span>
            Confirmation ka screenshot lein.
          </li>
          <li className="flex gap-2">
            <span className="tnum font-bold text-royal">3.</span>
            WhatsApp par bhejein. Aik ghante mein balance update ho jayega.
          </li>
        </ol>

        <Button as="a" href={waLink} target="_blank" rel="noopener noreferrer" variant="success" size="lg" full>
          WhatsApp par receipt bhejein
        </Button>

        {isDemo && (
          <button
            type="button"
            onClick={() => onDemoCredit(amount)}
            className="w-full rounded-2xl border border-dashed border-line py-3 text-[12.5px] font-semibold text-ink-muted"
          >
            Demo: {pkr(amount)} bina paise jama karein
          </button>
        )}
      </div>
    </Sheet>
  )
}

function PaymentMethod({ brand, accountTitle, number, tone, toast }) {
  const dot = tone === 'alert' ? 'bg-alert' : 'bg-success'
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${dot}`}>
        <Wallet className="w-5 h-5" strokeWidth={2.2} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold text-ink">{brand}</p>
        <p className="tnum text-[13px] text-ink-soft">{number}</p>
        <p className="text-[11.5px] text-ink-muted">{accountTitle}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(number.replace(/\s/g, ''))
            toast(`${brand} number copy ho gaya`)
          } catch {
            toast('Copy nahi hua. Number ko dabaye rakhein.', 'alert')
          }
        }}
        aria-label={`${brand} ka number copy karein`}
        className="tap grid shrink-0 place-items-center rounded-xl border border-line text-ink-soft press"
      >
        <Copy className="w-4 h-4" />
      </button>
    </div>
  )
}

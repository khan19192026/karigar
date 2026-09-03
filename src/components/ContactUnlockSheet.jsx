import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Loader2, Lock, MessageSquare, Phone, ShieldCheck, UserX } from 'lucide-react'
import { Button, Sheet, useToast } from './ui'
import { revealContact } from '../lib/db'
import { ensureConversation } from '../lib/chat'
import { prettyPhone, telHref, whatsappHref } from '../lib/format'

function WhatsAppGlyph({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1s-.5-.2-.7.1-.8 1-.9 1.2-.3.2-.6.1a8 8 0 0 1-2.4-1.5 9 9 0 0 1-1.6-2c-.2-.3 0-.5.1-.6l.5-.6.3-.5v-.5l-1-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4a3.2 3.2 0 0 0-1 2.4A5.6 5.6 0 0 0 7.3 12a12.7 12.7 0 0 0 4.9 4.3c.7.3 1.2.5 1.6.6a3.9 3.9 0 0 0 1.8.1 3 3 0 0 0 1.9-1.3 2.4 2.4 0 0 0 .2-1.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2m0 1.8a8.2 8.2 0 0 1 6.5 13.2 8.2 8.2 0 0 1-11 1.9l-.4-.2-3 .8.8-2.9-.2-.4A8.2 8.2 0 0 1 12 3.8" />
    </svg>
  )
}

/**
 * Reveals a karigar's contact details, charging the karigar as it does.
 *
 * The customer pays nothing and is told nothing about the fee — that is
 * between the platform and the karigar. What the customer sees is a brief
 * "Number khol rahe hain…" and then a number they can dial.
 *
 * `tech` is a directory row. Pass `known` when the contact was already paid
 * for, so a returning customer skips straight to the number.
 */
export default function ContactUnlockSheet({ tech, known, onClose, onRevealed }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [state, setState] = useState('idle') // idle | working | done | unavailable | error
  const [contact, setContact] = useState(null)
  const [opening, setOpening] = useState(false)

  /** Chat is the secondary channel — good for a photo of the broken thing,
   *  which a phone call cannot carry. */
  async function openChat() {
    setOpening(true)
    try {
      const id = await ensureConversation({ technicianId: tech.id })
      navigate(`/chats/${id}`)
    } catch {
      toast('Chat nahi khul saki', 'alert')
    } finally {
      setOpening(false)
    }
  }

  const run = useCallback(async () => {
    setState('working')
    try {
      const result = await revealContact(tech.id)
      setContact(result)
      setState('done')
      onRevealed?.(tech.id, result)
    } catch (err) {
      if (err.message === 'TECHNICIAN_UNAVAILABLE') {
        setState('unavailable')
      } else if (err.message === 'NOT_SIGNED_IN') {
        setState('error')
        toast('Pehle account banayein', 'alert')
      } else {
        setState('error')
      }
    }
  }, [tech, onRevealed, toast])

  useEffect(() => {
    if (!tech) return
    if (known) {
      setContact({ ...known, already_revealed: true })
      setState('done')
      return
    }
    // A short beat before the reveal, so the customer registers that the
    // number was fetched for them rather than sitting there all along.
    const t = setTimeout(run, 450)
    setState('working')
    return () => clearTimeout(t)
  }, [tech, known, run])

  if (!tech) return null

  const name = tech.shop_name || tech.full_name

  return (
    <Sheet open onClose={onClose} title={name} subtitle={`${tech.address_area} · ${tech.category_name || ''}`}>
      <div className="space-y-4 pb-2">
        {state === 'working' && (
          <div className="flex flex-col items-center gap-3 py-8" role="status">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-royal-wash">
              <Loader2 className="w-7 h-7 animate-spin text-royal" aria-hidden="true" />
            </span>
            <p className="text-[15px] font-bold text-ink">Number khol rahe hain…</p>
            <p className="text-[12.5px] text-ink-soft">Unlocking contact details</p>
          </div>
        )}

        {state === 'done' && contact && (
          <>
            <div className="card border-success/30 bg-success-wash p-4 text-center">
              <p className="eyebrow text-ink-muted">Karigar ka number</p>
              <p className="tnum mt-1 text-[26px] font-extrabold leading-none text-ink">
                {prettyPhone(contact.phone_number)}
              </p>
              <p className="mt-1.5 text-[13px] font-semibold text-ink-soft">{contact.full_name}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button as="a" href={telHref(contact.phone_number)} variant="primary" size="lg">
                <Phone className="w-4 h-4" strokeWidth={2.4} />
                Call karein
              </Button>
              <Button
                as="a"
                href={whatsappHref(
                  contact.whatsapp_number || contact.phone_number,
                  `Assalam o Alaikum. Mujhe ${tech.category_name || 'kaam'} ke liye karigar chahiye. Karigar D.I. Khan app se raabta kiya hai.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                variant="success"
                size="lg"
              >
                <WhatsAppGlyph />
                WhatsApp
              </Button>
            </div>

            <Button variant="outline" size="md" full loading={opening} onClick={openChat}>
              {!opening && <MessageSquare className="w-4 h-4" strokeWidth={2.2} />}
              App mein chat karein — tasveer bhejein
            </Button>

            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(prettyPhone(contact.phone_number))
                  toast('Number copy ho gaya')
                } catch {
                  toast('Copy nahi hua. Number ko dabaye rakhein.', 'alert')
                }
              }}
              className="tap flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 text-[13px] font-semibold text-ink-soft press"
            >
              <Copy className="w-4 h-4" />
              Number copy karein
            </button>

            <p className="flex items-start gap-2 rounded-2xl border border-line bg-canvas px-3.5 py-3 text-[12px] leading-relaxed text-ink-soft">
              <ShieldCheck className="mt-0.5 w-4 h-4 shrink-0 text-success" aria-hidden="true" />
              Yeh number aap ke paas mehfooz hai — dobara kholne par kuch nahi lagega.
            </p>
          </>
        )}

        {state === 'unavailable' && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-wash">
              <UserX className="w-7 h-7 text-amber-deep" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <p className="mt-1 text-[15px] font-bold text-ink">Yeh karigar filhaal available nahi</p>
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              Directory mein doosre karigar dekhein, ya kaam post kar dein — phir woh khud aap se
              raabta karenge.
            </p>
            <Button variant="outline" full className="mt-3" onClick={onClose}>
              Doosra karigar dekhein
            </Button>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-alert-wash">
              <Lock className="w-7 h-7 text-alert" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <p className="mt-1 text-[15px] font-bold text-ink">Number nahi khul saka</p>
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              Apna connection check karein aur dobara koshish karein.
            </p>
            <Button variant="primary" full className="mt-3" onClick={run}>
              Dobara koshish karein
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

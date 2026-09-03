import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MessageSquare, ShieldCheck } from 'lucide-react'
import MessageBubble from '../components/chat/MessageBubble'
import Composer from '../components/chat/Composer'
import { EmptyState, Loading, VerifiedBadge, useToast } from '../components/ui'
import {
  acceptOffer,
  declineOffer,
  getConversation,
  listMessages,
  markRead,
  subscribeToMessages,
} from '../lib/chat'
import { notifyLocally } from '../lib/push'
import { useSession } from '../store/session'
import { pkr } from '../lib/format'

/**
 * A conversation thread.
 *
 * Realtime keeps it live: Supabase pushes over a WebSocket, and the demo
 * backend fires an event on write so two windows side by side still behave
 * like a real chat.
 */
export default function Chat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { profile, loading: sessionLoading, refresh } = useSession()

  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [offerBusy, setOfferBusy] = useState(false)

  const bottomRef = useRef(null)
  const lastCountRef = useRef(0)

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true)
      try {
        const [conv, msgs] = await Promise.all([getConversation(id), listMessages(id)])
        setConversation(conv)
        setMessages(msgs)

        // A message that arrived while the tab was hidden earns a
        // notification; one that arrives while it is visible does not.
        const incoming = msgs.filter((m) => m.sender_id !== profile?.id)
        if (lastCountRef.current && incoming.length > lastCountRef.current) {
          const latest = incoming[incoming.length - 1]
          notifyLocally({
            title: conv?.other_name || 'Karigar D.I. Khan',
            body:
              latest.kind === 'text'
                ? latest.body
                : latest.kind === 'offer'
                  ? `Naya offer: ${pkr(latest.offer_amount)}`
                  : 'Nayi file aayi hai',
            url: `/chats/${id}`,
          })
        }
        lastCountRef.current = incoming.length

        await markRead(id)
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [id, profile?.id],
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => subscribeToMessages(id, () => load({ silent: true })), [id, load])

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  function explain(code) {
    switch (code) {
      case 'CANNOT_ACCEPT_OWN_OFFER':
        return 'Apna offer khud manzoor nahi kar sakte'
      case 'OFFER_NOT_PENDING':
        return 'Yeh offer purana ho gaya hai'
      case 'TOO_MANY_UNCONFIRMED':
        return 'Pehle purane kaam ka status daalein'
      case 'NEGATIVE_BALANCE':
        return 'Karigar ke wallet mein baqaya hai'
      case 'FROZEN':
        return 'Karigar ka access filhaal roka gaya hai'
      default:
        return 'Kaam nahi hua. Dobara koshish karein.'
    }
  }

  async function handleAccept(message) {
    setOfferBusy(true)
    try {
      const result = await acceptOffer(message.id)
      await Promise.all([load({ silent: true }), refresh()])
      toast(`Qeemat pakki — ${pkr(result.amount)}. Kaam shuru.`, 'success')
    } catch (err) {
      toast(explain(err.message), 'alert')
    } finally {
      setOfferBusy(false)
    }
  }

  async function handleDecline(message) {
    setOfferBusy(true)
    try {
      await declineOffer(message.id)
      await load({ silent: true })
    } catch (err) {
      toast(explain(err.message), 'alert')
    } finally {
      setOfferBusy(false)
    }
  }

  if (sessionLoading) return <Loading />
  if (!profile) return <Navigate to="/onboarding" replace />

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-card px-3 py-2.5">
        <button
          type="button"
          onClick={() => navigate('/chats')}
          aria-label="Wapas"
          className="tap grid shrink-0 place-items-center rounded-full text-ink-soft hover:bg-canvas"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="min-w-0 truncate text-[15px] font-bold leading-tight text-ink">
              {conversation?.other_name || 'Guftagu'}
            </h1>
            {conversation?.other_verified && <VerifiedBadge />}
          </div>
          <p className="truncate text-[11.5px] text-ink-muted">
            {conversation?.request_title || conversation?.other_area || 'Karigar D.I. Khan'}
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-2 px-4 py-4">
        {loading ? (
          <Loading label="Messages aa rahe hain" />
        ) : messages.length === 0 ? (
          <div className="pt-6">
            <EmptyState
              icon={MessageSquare}
              title="Guftagu shuru karein"
              body="Masla likhein, ya kharab cheez ki tasveer bhejein — karigar ko samajhne mein aasani hogi."
            />
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              mine={m.sender_id === profile.id}
              busy={offerBusy}
              onAccept={handleAccept}
              onDecline={handleDecline}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <p className="flex items-start gap-2 px-4 pb-2 text-[11px] leading-relaxed text-ink-muted">
        <ShieldCheck className="mt-0.5 w-3.5 h-3.5 shrink-0 text-success" aria-hidden="true" />
        Phone number likhne ki zaroorat nahi — app khud pohanchata hai.
      </p>

      <div className="sticky bottom-0">
        <Composer conversationId={id} onSent={() => load({ silent: true })} />
      </div>
    </div>
  )
}

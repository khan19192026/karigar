import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Bell, MapPin, MessageSquare } from 'lucide-react'
import { Button, EmptyState, Loading, VerifiedBadge } from '../components/ui'
import { listConversations, subscribeToInbox } from '../lib/chat'
import { alreadyAsked, enablePush, permission, pushSupported } from '../lib/push'
import { useSession } from '../store/session'
import { initials, timeAgo } from '../lib/format'

/** Conversation list, newest activity first. */
export default function Inbox() {
  const navigate = useNavigate()
  const { profile, loading: sessionLoading, isTechnician } = useSession()
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPushAsk, setShowPushAsk] = useState(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      setThreads(await listConversations())
    } catch {
      setThreads([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (profile) load()
  }, [profile, load])

  useEffect(() => subscribeToInbox(() => load({ silent: true })), [load])

  // Ask about notifications here rather than on first launch: the request
  // makes sense once someone has a conversation to be notified about.
  useEffect(() => {
    if (!pushSupported() || alreadyAsked()) return
    if (permission() === 'default' && threads.length > 0) setShowPushAsk(true)
  }, [threads.length])

  if (sessionLoading) return <Loading />
  if (!profile) return <Navigate to="/onboarding" replace />

  return (
    <div className="px-5 pt-4">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[20px] font-extrabold tracking-tight text-ink">Guftagu</h1>
        {threads.length > 0 && (
          <span className="tnum text-[12.5px] font-semibold text-ink-soft">
            {threads.length} {threads.length === 1 ? 'baat' : 'baatein'}
          </span>
        )}
      </div>

      {showPushAsk && (
        <div className="card mb-3 flex items-start gap-2.5 border-royal/25 bg-royal-wash p-3.5">
          <Bell className="mt-0.5 w-4 h-4 shrink-0 text-royal" strokeWidth={2.2} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold text-ink">Naye message ki khabar chahiye?</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">
              Ijazat dein to naya message aane par phone par notification aa jayegi.
            </p>
            <div className="mt-2.5 flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  await enablePush()
                  setShowPushAsk(false)
                }}
              >
                Ijazat dein
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowPushAsk(false)}>
                Baad mein
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <Loading label="Guftagu load ho rahi hai" />
      ) : threads.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Abhi koi guftagu nahi"
          body={
            isTechnician
              ? 'Jab customer aap se raabta karega, uski baat yahan aa jayegi.'
              : 'Directory se karigar ka contact kholein, phir chat shuru kar sakte hain.'
          }
          action={
            isTechnician ? null : (
              <Button variant="action" full onClick={() => navigate('/directory')}>
                Karigar dhoondein
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {threads.map((t, i) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => navigate(`/chats/${t.id}`)}
                className="card animate-rise flex w-full items-center gap-3 p-3.5 text-left press"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-royal-wash text-[14px] font-bold text-royal">
                  {initials(t.other_name)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate text-[14.5px] font-bold text-ink">
                      {t.other_name}
                    </span>
                    {t.other_verified && <VerifiedBadge />}
                  </span>

                  <span
                    className={`mt-0.5 block truncate text-[12.5px] ${
                      t.unread > 0 ? 'font-semibold text-ink' : 'text-ink-soft'
                    }`}
                  >
                    {t.last_message_preview || 'Guftagu shuru karein'}
                  </span>

                  {(t.request_title || t.other_area) && (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted">
                      <MapPin className="w-3 h-3" aria-hidden="true" />
                      <span className="truncate">{t.request_title || t.other_area}</span>
                    </span>
                  )}
                </span>

                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="tnum text-[11px] text-ink-muted">
                    {timeAgo(t.last_message_at)}
                  </span>
                  {t.unread > 0 && (
                    <span className="tnum grid min-w-5 place-items-center rounded-full bg-royal px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {t.unread}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

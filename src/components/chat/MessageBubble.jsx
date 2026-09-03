import { useRef, useState } from 'react'
import { Check, CheckCheck, Handshake, Pause, Play } from 'lucide-react'
import useMediaUrl from './useMediaUrl'
import { Button, Chip } from '../ui'
import { pkr, secondsToClock } from '../../lib/format'

function clockTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })
}

/**
 * One message. Text, voice, photo, video, an offer, or a system line.
 *
 * Offers get their own card rather than a bubble, because an offer is a
 * decision the reader has to act on — not something to be skimmed past.
 */
export default function MessageBubble({ message, mine, onAccept, onDecline, busy }) {
  if (message.kind === 'system') {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-royal-wash px-3 py-1.5 text-center text-[11.5px] font-semibold text-royal">
          {message.body}
        </span>
      </div>
    )
  }

  if (message.kind === 'offer') {
    return (
      <OfferCard
        message={message}
        mine={mine}
        onAccept={onAccept}
        onDecline={onDecline}
        busy={busy}
      />
    )
  }

  const skin = mine
    ? 'bg-royal text-white rounded-br-md'
    : 'bg-card text-ink border border-line rounded-bl-md'

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[82%] rounded-2xl px-3 py-2 ${skin}`}>
        {message.kind === 'text' && (
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{message.body}</p>
        )}
        {message.kind === 'voice' && <VoiceMessage message={message} mine={mine} />}
        {message.kind === 'image' && <ImageMessage message={message} />}
        {message.kind === 'video' && <VideoMessage message={message} />}

        <span
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            mine ? 'text-white/60' : 'text-ink-muted'
          }`}
        >
          <span className="tnum">{clockTime(message.created_at)}</span>
          {mine &&
            (message.read_at ? (
              <CheckCheck className="w-3 h-3" aria-label="Parh liya" />
            ) : (
              <Check className="w-3 h-3" aria-label="Bhej diya" />
            ))}
        </span>
      </div>
    </div>
  )
}

function VoiceMessage({ message, mine }) {
  const url = useMediaUrl(message.media_url)
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const seconds = Math.round((message.media_duration_ms || 0) / 1000)

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <audio ref={ref} src={url || undefined} preload="metadata" onEnded={() => setPlaying(false)} className="hidden" />
      <button
        type="button"
        disabled={!url}
        onClick={() => {
          const el = ref.current
          if (!el) return
          if (el.paused) {
            el.play()
            setPlaying(true)
          } else {
            el.pause()
            setPlaying(false)
          }
        }}
        aria-label={playing ? 'Rokein' : 'Sunein'}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full press disabled:opacity-40
          ${mine ? 'bg-white/20 text-white' : 'bg-royal text-white'}`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-0.5" />}
      </button>

      {/* A static waveform: it signals "this is audio" without pretending to
          show real amplitude data we never computed. */}
      <span className="flex h-5 items-center gap-[2px]" aria-hidden="true">
        {[6, 11, 8, 15, 10, 18, 12, 8, 14, 9, 16, 7].map((h, i) => (
          <span
            key={i}
            className={`w-[2px] rounded-full ${mine ? 'bg-white/50' : 'bg-royal/40'}`}
            style={{ height: `${h}px` }}
          />
        ))}
      </span>

      <span className={`tnum shrink-0 text-[11px] ${mine ? 'text-white/70' : 'text-ink-muted'}`}>
        {secondsToClock(seconds)}
      </span>
    </div>
  )
}

function ImageMessage({ message }) {
  const url = useMediaUrl(message.media_url)
  if (!url) return <div className="h-40 w-48 animate-pulse rounded-xl bg-line/50" aria-hidden="true" />
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt="Bheji gayi tasveer"
        loading="lazy"
        className="max-h-64 w-full rounded-xl object-cover"
      />
    </a>
  )
}

function VideoMessage({ message }) {
  const url = useMediaUrl(message.media_url)
  if (!url) return <div className="h-40 w-48 animate-pulse rounded-xl bg-line/50" aria-hidden="true" />
  return (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      className="max-h-64 w-full rounded-xl bg-ink"
    />
  )
}

/**
 * An offer. Only the other party can accept it — you cannot agree with
 * yourself — and only the newest pending offer is actionable, because
 * sending a new one supersedes the last.
 */
function OfferCard({ message, mine, onAccept, onDecline, busy }) {
  const status = message.offer_status
  const actionable = !mine && status === 'pending'

  const tone =
    status === 'accepted'
      ? 'border-success/40 bg-success-wash'
      : status === 'declined' || status === 'superseded'
        ? 'border-line bg-canvas opacity-70'
        : 'border-amber/40 bg-amber-wash'

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`w-[86%] rounded-[var(--radius-card)] border p-3.5 ${tone}`}>
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-royal text-white">
            <Handshake className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-ink-muted">{mine ? 'Aap ka offer' : 'Offer aaya hai'}</p>
            <p className="tnum text-[20px] font-extrabold leading-tight text-ink">
              {pkr(message.offer_amount)}
            </p>
          </div>
          {status !== 'pending' && (
            <Chip
              tone={
                status === 'accepted' ? 'success' : status === 'declined' ? 'alert' : 'neutral'
              }
            >
              {status === 'accepted'
                ? 'Manzoor'
                : status === 'declined'
                  ? 'Inkaar'
                  : 'Purana'}
            </Chip>
          )}
        </div>

        {message.body && (
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{message.body}</p>
        )}

        {actionable && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => onDecline(message)} loading={busy}>
              Inkaar
            </Button>
            <Button variant="success" size="sm" onClick={() => onAccept(message)} loading={busy}>
              Offer manzoor
            </Button>
          </div>
        )}

        {mine && status === 'pending' && (
          <p className="mt-2 text-[11.5px] text-ink-muted">Jawab ka intezar hai</p>
        )}

        <p className="tnum mt-2 text-right text-[10px] text-ink-muted">
          {clockTime(message.created_at)}
        </p>
      </div>
    </div>
  )
}

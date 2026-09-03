import { useCallback, useEffect, useRef, useState } from 'react'
import { Handshake, ImagePlus, Loader2, Mic, Send, Square, X } from 'lucide-react'
import OfferSheet from './OfferSheet'
import { useToast } from '../ui'
import { sendMessage, uploadChatMedia } from '../../lib/chat'
import {
  VOICE_BITRATE,
  VOICE_MAX_SECONDS,
  classifyFile,
  compressImage,
  compressVideo,
  pickAudioMime,
  prettyBytes,
} from '../../lib/media'
import { secondsToClock } from '../../lib/format'

/**
 * The chat composer: text, a voice note, a photo or video, or a price offer.
 *
 * Media is compressed here, on the device, before it ever reaches the
 * network — a raw phone photo is several megabytes and this pilot runs on
 * mobile data. The progress line is not decoration: video re-encoding runs
 * in real time, so a 30-second clip takes about 30 seconds and the user has
 * to be able to see that something is happening.
 */
export default function Composer({ conversationId, onSent }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(null) // null | 'text' | 'image' | 'video' | 'voice'
  const [progress, setProgress] = useState(0)
  const [offerOpen, setOfferOpen] = useState(false)

  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const fileRef = useRef(null)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const cancelledRef = useRef(false)

  const teardown = useCallback(() => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setRecording(false)
  }, [])

  useEffect(() => teardown, [teardown])

  async function post(payload) {
    const row = await sendMessage({ conversationId, ...payload })
    onSent?.(row)
  }

  async function sendText(e) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || busy) return
    setBusy('text')
    setText('')
    try {
      await post({ kind: 'text', body })
    } catch {
      setText(body)
      toast('Message nahi gaya. Dobara koshish karein.', 'alert')
    } finally {
      setBusy(null)
    }
  }

  /* ── photo / video ── */

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const kind = classifyFile(file)
    if (!kind) {
      toast('Sirf tasveer ya video bhej sakte hain', 'alert')
      return
    }

    setBusy(kind)
    setProgress(0)
    try {
      const result =
        kind === 'image'
          ? await compressImage(file)
          : await compressVideo(file, { onProgress: setProgress })

      const url = await uploadChatMedia(result.blob, kind)
      await post({
        kind,
        mediaUrl: url,
        sizeBytes: result.blob.size,
        durationMs: result.durationMs || null,
      })

      if (result.truncated) {
        toast(`Video ${VOICE_MAX_SECONDS > 0 ? '' : ''}kaat di gayi — sirf shuru ka hissa bheja gaya`, 'royal')
      }
    } catch (err) {
      if (err.message === 'VIDEO_TOO_LARGE_NO_TRANSCODE') {
        toast('Yeh video bohat bari hai aur iss browser mein chhoti nahi ho sakti', 'alert')
      } else if (err.message === 'STORAGE_FULL') {
        toast('Iss device par jagah khatam ho gayi', 'alert')
      } else {
        toast('File nahi bheji ja saki', 'alert')
      }
    } finally {
      setBusy(null)
      setProgress(0)
    }
  }

  /* ── voice note ── */

  async function startRecording() {
    if (busy || recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      cancelledRef.current = false

      const mimeType = pickAudioMime()
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: VOICE_BITRATE,
      })
      recorderRef.current = recorder

      const chunks = []
      recorder.ondataavailable = (ev) => ev.data.size > 0 && chunks.push(ev.data)

      recorder.onstop = async () => {
        const elapsed = seconds
        teardown()
        if (cancelledRef.current) return

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size === 0) return

        setBusy('voice')
        try {
          const url = await uploadChatMedia(blob, 'voice')
          await post({
            kind: 'voice',
            mediaUrl: url,
            durationMs: Math.max(1000, elapsed * 1000),
            sizeBytes: blob.size,
          })
        } catch {
          toast('Voice note nahi gaya', 'alert')
        } finally {
          setBusy(null)
          setSeconds(0)
        }
      }

      recorder.start()
      setSeconds(0)
      setRecording(true)

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1
          if (next >= VOICE_MAX_SECONDS && recorderRef.current?.state === 'recording') {
            recorderRef.current.stop()
          }
          return next
        })
      }, 1000)
    } catch {
      teardown()
      toast('Microphone ki ijazat nahi mili', 'alert')
    }
  }

  function stopRecording(cancel = false) {
    cancelledRef.current = cancel
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    else teardown()
    if (cancel) setSeconds(0)
  }

  /* ── render ── */

  if (recording) {
    return (
      <div className="border-t border-line bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => stopRecording(true)}
            aria-label="Radd karein"
            className="tap grid shrink-0 place-items-center rounded-full text-ink-muted"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-1 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-alert" aria-hidden="true" />
            <span className="tnum text-[15px] font-bold text-alert">{secondsToClock(seconds)}</span>
            <span className="text-[12px] text-ink-muted">rikaard ho raha hai…</span>
          </div>

          <button
            type="button"
            onClick={() => stopRecording(false)}
            aria-label="Bhejein"
            className="tap animate-pulse-ring grid shrink-0 place-items-center rounded-full bg-alert text-white press"
          >
            <Square className="w-5 h-5 fill-current" />
          </button>
        </div>
        <p className="tnum mt-1.5 text-[11px] text-ink-muted">
          {VOICE_MAX_SECONDS} second par khud ruk jayega
        </p>
      </div>
    )
  }

  const compressing = busy === 'image' || busy === 'video'

  return (
    <>
      <div className="border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        {compressing && (
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-royal" aria-hidden="true" />
            <span className="text-[12px] font-semibold text-ink-soft">
              {busy === 'video' ? 'Video chhoti kar rahe hain…' : 'Tasveer chhoti kar rahe hain…'}
            </span>
            {busy === 'video' && progress > 0 && (
              <span className="tnum ml-auto text-[12px] text-ink-muted">
                {Math.round(progress * 100)}%
              </span>
            )}
          </div>
        )}

        <form onSubmit={sendText} className="flex items-end gap-2 px-3 py-2.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/*"
            onChange={handleFile}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={Boolean(busy)}
            aria-label="Tasveer ya video bhejein"
            className="tap grid shrink-0 place-items-center rounded-full text-ink-soft press disabled:opacity-40"
          >
            <ImagePlus className="w-[22px] h-[22px]" strokeWidth={1.9} />
          </button>

          <button
            type="button"
            onClick={() => setOfferOpen(true)}
            disabled={Boolean(busy)}
            aria-label="Price offer bhejein"
            className="tap grid shrink-0 place-items-center rounded-full text-royal press disabled:opacity-40"
          >
            <Handshake className="w-[22px] h-[22px]" strokeWidth={1.9} />
          </button>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) sendText(e)
            }}
            rows={1}
            placeholder="Message likhein…"
            aria-label="Message"
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-line bg-canvas px-3.5 py-3
              text-[15px] leading-snug focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/20"
          />

          {text.trim() ? (
            <button
              type="submit"
              disabled={Boolean(busy)}
              aria-label="Bhejein"
              className="tap grid shrink-0 place-items-center rounded-full bg-royal text-white press disabled:opacity-40"
            >
              {busy === 'text' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" strokeWidth={2.2} />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={Boolean(busy)}
              aria-label="Voice note rikaard karein"
              className="tap grid shrink-0 place-items-center rounded-full bg-royal text-white press disabled:opacity-40"
            >
              {busy === 'voice' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Mic className="w-5 h-5" strokeWidth={2.2} />
              )}
            </button>
          )}
        </form>
      </div>

      <OfferSheet
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        onSend={async ({ amount, description }) => {
          await post({ kind: 'offer', body: description, offerAmount: amount })
        }}
      />
    </>
  )
}

export { prettyBytes }

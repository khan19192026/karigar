import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2, Play, Pause } from 'lucide-react'
import { MAX_VOICE_NOTE_SECONDS } from '../lib/constants'
import { secondsToClock } from '../lib/format'

/** Picks a container the browser will actually record. Safari only does
 *  mp4/aac; Chrome and Firefox prefer webm/opus. */
function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

/**
 * Voice note recorder — the feature that lets someone who cannot comfortably
 * type still post a job. Capped at 30 seconds, with a live level meter so
 * the user can see the mic is hearing them.
 *
 * Calls `onChange(blob | null)` whenever the recording is made or cleared.
 */
export default function VoiceRecorder({ onChange, disabled }) {
  const [status, setStatus] = useState('idle') // idle | recording | ready | denied | unsupported
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)

  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const rafRef = useRef(null)
  const audioCtxRef = useRef(null)
  const audioElRef = useRef(null)
  // Mirrors previewUrl in a ref so unmount can revoke it — a state updater
  // scheduled during cleanup never runs.
  const previewUrlRef = useRef(null)

  const setPreview = useCallback((url) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url
    setPreviewUrl(url)
  }, [])

  const supported =
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'

  /** Releases the mic, the meter loop and the timer. Must run on every exit
   *  path or the browser keeps showing the recording indicator. */
  const teardown = useCallback(() => {
    clearInterval(timerRef.current)
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (audioCtxRef.current?.state !== 'closed') audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    setLevel(0)
  }, [])

  useEffect(() => {
    if (!supported) setStatus('unsupported')
    return () => {
      teardown()
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [supported, teardown])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream

      // Live level meter — purely so the user can tell it is listening.
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx) {
        const ctx = new Ctx()
        audioCtxRef.current = ctx
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        ctx.createMediaStreamSource(stream).connect(analyser)
        const buf = new Uint8Array(analyser.frequencyBinCount)
        const tick = () => {
          analyser.getByteTimeDomainData(buf)
          let peak = 0
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
          setLevel(Math.min(1, peak / 60))
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      }

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        teardown()
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size === 0) {
          setStatus('idle')
          return
        }
        setPreview(URL.createObjectURL(blob))
        setStatus('ready')
        onChange?.(blob)
      }

      recorder.start()
      setSeconds(0)
      setStatus('recording')

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1
          if (next >= MAX_VOICE_NOTE_SECONDS) stop()
          return next
        })
      }, 1000)
    } catch (err) {
      teardown()
      setStatus(err?.name === 'NotAllowedError' ? 'denied' : 'unsupported')
    }
  }, [onChange, setPreview, stop, teardown])

  const clear = useCallback(() => {
    audioElRef.current?.pause()
    setPlaying(false)
    setPreview(null)
    setSeconds(0)
    setStatus('idle')
    onChange?.(null)
  }, [onChange, setPreview])

  const togglePlay = () => {
    const el = audioElRef.current
    if (!el) return
    if (el.paused) {
      el.play()
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }

  /* ── unsupported / denied ── */

  if (status === 'unsupported' || status === 'denied') {
    return (
      <div className="card border-dashed p-4">
        <p className="text-[13px] font-semibold text-ink">
          {status === 'denied' ? 'Microphone access is blocked' : 'This browser cannot record audio'}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
          {status === 'denied'
            ? 'Allow the microphone in your browser settings to record a voice note, or type the details above instead.'
            : 'Type the job details above instead — the karigar will still get everything they need.'}
        </p>
      </div>
    )
  }

  /* ── recorded ── */

  if (status === 'ready' && previewUrl) {
    return (
      <div className="card flex items-center gap-3 border-success/30 bg-success-wash p-3">
        <audio
          ref={audioElRef}
          src={previewUrl}
          onEnded={() => setPlaying(false)}
          preload="metadata"
          className="hidden"
        />
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause voice note' : 'Play voice note'}
          className="tap grid shrink-0 place-items-center rounded-full bg-success text-white press"
        >
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 translate-x-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-ink">Voice note recorded</p>
          <p className="tnum text-[12px] text-ink-soft">{secondsToClock(seconds)} · attached to this job</p>
        </div>
        <button
          type="button"
          onClick={clear}
          aria-label="Delete voice note"
          className="tap grid shrink-0 place-items-center rounded-full text-ink-muted hover:bg-card"
        >
          <Trash2 className="w-[18px] h-[18px]" />
        </button>
      </div>
    )
  }

  /* ── recording ── */

  if (status === 'recording') {
    const pct = (seconds / MAX_VOICE_NOTE_SECONDS) * 100
    return (
      <div className="card border-alert/30 bg-alert-wash p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={stop}
            aria-label="Stop recording"
            className="tap animate-pulse-ring grid shrink-0 place-items-center rounded-full bg-alert text-white press"
          >
            <Square className="w-5 h-5 fill-current" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-alert">Recording — tap the square to stop</p>
            {/* Level meter: 14 bars lit in proportion to input volume. */}
            <div className="mt-2 flex h-5 items-end gap-[3px]" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, i) => {
                const lit = level * 14 > i
                return (
                  <span
                    key={i}
                    className={`w-full rounded-sm transition-all duration-75 ${lit ? 'bg-alert' : 'bg-alert/20'}`}
                    style={{ height: lit ? `${30 + Math.random() * 70}%` : '25%' }}
                  />
                )
              })}
            </div>
          </div>
          <span className="tnum shrink-0 text-[15px] font-bold text-alert">{secondsToClock(seconds)}</span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-alert/15">
          <div className="h-full rounded-full bg-alert transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="tnum mt-1.5 text-[11px] text-ink-soft">
          Stops automatically at {MAX_VOICE_NOTE_SECONDS} seconds
        </p>
      </div>
    )
  }

  /* ── idle ── */

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      className="card tap press flex w-full items-center gap-3 border-dashed border-royal/30 bg-royal-wash p-4 text-left
        disabled:opacity-45"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-royal text-white">
        <Mic className="w-5 h-5" strokeWidth={2.2} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-bold text-ink">Record a voice note</span>
        <span className="block text-[12.5px] leading-snug text-ink-soft">
          Bata dein masla kya hai — {MAX_VOICE_NOTE_SECONDS} seconds tak
        </span>
      </span>
    </button>
  )
}

/** Playback for a saved note, used on job cards in the lead centre. */
export function VoiceNotePlayer({ url, label = 'Customer voice note' }) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)

  if (!url) return null

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-royal/15 bg-royal-wash px-3 py-2">
      <audio ref={ref} src={url} preload="none" onEnded={() => setPlaying(false)} className="hidden" />
      <button
        type="button"
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
        aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-royal text-white press"
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-0.5" />}
      </button>
      <span className="text-[12.5px] font-semibold text-royal">{label}</span>
    </div>
  )
}

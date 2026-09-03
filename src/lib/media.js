/**
 * Client-side media compression.
 *
 * Everything here exists because of one constraint: a karigar in D.I. Khan is
 * on a mid-range Android over a patchy mobile connection. Uploading a 4 MB
 * phone photo is not an option, and neither is shipping a 25 MB ffmpeg.wasm
 * bundle to avoid it. So images go through canvas, and video through a
 * canvas + MediaRecorder re-encode that needs no dependency at all.
 */

export const IMAGE_TARGET_BYTES = 400 * 1024 // ~400KB, inside the 300–500KB brief
export const IMAGE_MAX_EDGE = 1600
export const VIDEO_MAX_BYTES = 8 * 1024 * 1024 // ~8MB, inside the 5–10MB brief
export const VIDEO_MAX_SECONDS = 45
export const VIDEO_TARGET_HEIGHT = 720
export const VIDEO_FALLBACK_HEIGHT = 480
export const VOICE_MAX_SECONDS = 120
export const VOICE_BITRATE = 24_000 // plenty for speech, tiny on the wire

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

export function prettyBytes(n) {
  if (!Number.isFinite(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/* ═══════════════════════════════════════════════════════════════ images ══ */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('IMAGE_DECODE_FAILED'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('ENCODE_FAILED'))),
      type,
      quality,
    )
  })
}

/**
 * Resizes to fit IMAGE_MAX_EDGE, then walks JPEG quality down until the file
 * fits IMAGE_TARGET_BYTES. Stepping quality beats a single guess: a photo of
 * a switchboard and a photo of a plain wall compress very differently.
 */
export async function compressImage(file) {
  const img = await loadImage(file)

  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  let blob = null
  for (const quality of [0.82, 0.72, 0.62, 0.5, 0.4]) {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (blob.size <= IMAGE_TARGET_BYTES) break
  }

  // Still oversized on a very large image: halve the edge once and retry.
  if (blob && blob.size > IMAGE_TARGET_BYTES && Math.max(w, h) > 900) {
    canvas.width = Math.round(w / 2)
    canvas.height = Math.round(h / 2)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.7)
  }

  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    originalSize: file.size,
    type: 'image/jpeg',
  }
}

/* ════════════════════════════════════════════════════════════════ video ══ */

function pickVideoMime() {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || null
}

export function canTranscodeVideo() {
  return Boolean(
    typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      HTMLCanvasElement.prototype.captureStream &&
      pickVideoMime(),
  )
}

function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => resolve({ video, url })
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('VIDEO_DECODE_FAILED'))
    }
    video.src = url
  })
}

/**
 * Downscales and re-encodes a video by playing it into a canvas and
 * recording the canvas stream.
 *
 * Two honest limitations, surfaced rather than hidden:
 *  - It runs in real time. A 45-second clip takes about 45 seconds, which is
 *    why the duration cap is low and `onProgress` exists.
 *  - Output is WebM, not MP4. Every Android browser plays it; Safari is the
 *    gap, and there we fall back to passing the original through when it is
 *    already small enough.
 */
export async function compressVideo(file, { onProgress } = {}) {
  if (!canTranscodeVideo()) {
    if (file.size <= VIDEO_MAX_BYTES) {
      return { blob: file, type: file.type, originalSize: file.size, passthrough: true }
    }
    throw new Error('VIDEO_TOO_LARGE_NO_TRANSCODE')
  }

  const { video, url } = await loadVideo(file)

  try {
    const duration = Number.isFinite(video.duration) ? video.duration : VIDEO_MAX_SECONDS
    const cappedDuration = Math.min(duration, VIDEO_MAX_SECONDS)

    // Aim for 720p; drop to 480p for anything long, where 720p would blow
    // the size budget.
    const targetHeight = cappedDuration > 20 ? VIDEO_FALLBACK_HEIGHT : VIDEO_TARGET_HEIGHT
    const srcW = video.videoWidth || 640
    const srcH = video.videoHeight || 480
    const scale = Math.min(1, targetHeight / srcH)
    // Even dimensions keep every encoder happy.
    const w = Math.max(2, Math.round((srcW * scale) / 2) * 2)
    const h = Math.max(2, Math.round((srcH * scale) / 2) * 2)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')

    const canvasStream = canvas.captureStream(24)

    // Carry the audio across if the browser exposes it. Video-only is an
    // acceptable degradation; failing the whole upload is not.
    try {
      const src = video.captureStream?.() || video.mozCaptureStream?.()
      for (const track of src?.getAudioTracks?.() || []) canvasStream.addTrack(track)
    } catch {
      /* no audio track available — continue silent */
    }

    const mimeType = pickVideoMime()
    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: targetHeight >= 720 ? 1_200_000 : 700_000,
      audioBitsPerSecond: 64_000,
    })

    const chunks = []
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)

    const done = new Promise((resolve) => {
      recorder.onstop = () => resolve()
    })

    recorder.start(250)
    video.currentTime = 0
    await video.play()

    let stopped = false
    const stop = () => {
      if (stopped) return
      stopped = true
      video.pause()
      if (recorder.state !== 'inactive') recorder.stop()
      canvasStream.getTracks().forEach((t) => t.stop())
    }

    const draw = () => {
      if (stopped) return
      if (video.ended || video.currentTime >= cappedDuration) {
        stop()
        return
      }
      ctx.drawImage(video, 0, 0, w, h)
      onProgress?.(Math.min(1, video.currentTime / cappedDuration))
      requestAnimationFrame(draw)
    }
    requestAnimationFrame(draw)

    video.onended = stop
    await done

    const blob = new Blob(chunks, { type: mimeType })
    return {
      blob,
      type: mimeType,
      width: w,
      height: h,
      durationMs: Math.round(cappedDuration * 1000),
      originalSize: file.size,
      truncated: duration > VIDEO_MAX_SECONDS,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/* ════════════════════════════════════════════════════════════════ voice ══ */

export function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return null
  // Opus in WebM is the lightweight default; mp4/aac is Safari's equivalent.
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

/** Validates a picked file before any work is done on it. */
export function classifyFile(file) {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'image'
  if (ACCEPTED_VIDEO_TYPES.includes(file.type) || file.type.startsWith('video/')) return 'video'
  return null
}

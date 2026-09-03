/** Formatting helpers. Money and phone numbers are the two things this app
 *  must never render sloppily. */

/** "PKR 1,000" — no decimals, because nobody quotes paisa for a repair job. */
export function pkr(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return 'PKR —'
  return `PKR ${Math.round(n).toLocaleString('en-PK')}`
}

/**
 * Normalises anything a Pakistani user might type into E.164 digits.
 *   "0300 1234567" → "923001234567"
 *   "+92-300-1234567" → "923001234567"
 * Returns null when the result is not a plausible Pakistani mobile number.
 */
export function toE164(input) {
  if (!input) return null
  let d = String(input).replace(/\D/g, '')
  if (d.startsWith('0092')) d = d.slice(4)
  else if (d.startsWith('92')) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  // Pakistani mobiles are 10 digits after the country code and start with 3.
  if (d.length !== 10 || !d.startsWith('3')) return null
  return `92${d}`
}

/** "923001234567" → "0300 1234567" for display. */
export function prettyPhone(input) {
  const e164 = toE164(input)
  if (!e164) return input || ''
  const local = e164.slice(2)
  return `0${local.slice(0, 3)} ${local.slice(3)}`
}

export function telHref(input) {
  const e164 = toE164(input)
  return e164 ? `tel:+${e164}` : undefined
}

export function whatsappHref(input, message) {
  const e164 = toE164(input)
  if (!e164) return undefined
  const base = `https://wa.me/${e164}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

/** Urdu and Arabic-Indic digits → ASCII, so a number typed on an Urdu
 *  keyboard is still recognised as a number. */
export function normalizeDigits(text) {
  return String(text ?? '').replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.codePointAt(0)
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660))
  })
}

/** Any run of 7+ digits, allowing the separators people actually type. */
const PHONE_CANDIDATE = /\+?\d(?:[\s.\-()]?\d){6,15}/g

/**
 * Is this digit string shaped like a Pakistani phone number?
 *
 * Deliberately strict about shape rather than just length, so a price range
 * ("1000-2000") or a budget is never mistaken for a number and mangled.
 */
function looksLikePkPhone(input) {
  let d = input
  if (d.startsWith('0092')) d = d.slice(4)
  else if (d.startsWith('92') && d.length >= 12) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)

  if (d.length === 10 && d.startsWith('3')) return true // mobile
  return d.length >= 9 && d.length <= 11 // landline, or a mistyped mobile
}

/**
 * Masks phone numbers written into free text.
 *
 * The whole business model is that a customer's number is what a karigar
 * pays for — and a job description is visible to every karigar *before*
 * they pay. So a number typed in here gives itself away for free and no
 * lead ever sells. Applied at write time, on both backends.
 *
 * Returns { text, found } so the form can tell the customer what happened
 * instead of silently eating their words.
 */
export function maskPhoneNumbers(text) {
  const normalized = normalizeDigits(text)
  let found = false

  const masked = normalized.replace(PHONE_CANDIDATE, (match) => {
    if (!looksLikePkPhone(match.replace(/\D/g, ''))) return match
    found = true
    return '•••••'
  })

  return { text: masked, found }
}

/** CNIC as 12345-1234567-1. Returns null if it isn't 13 digits. */
export function formatCnic(input) {
  const d = String(input || '').replace(/\D/g, '').slice(0, 13)
  if (!d) return ''
  if (d.length <= 5) return d
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`
}

export function isValidCnic(input) {
  return String(input || '').replace(/\D/g, '').length === 13
}

/** Relative time, short enough for a card corner. */
export function timeAgo(iso) {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} d ago`
  return new Date(iso).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })
}

export function secondsToClock(s) {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

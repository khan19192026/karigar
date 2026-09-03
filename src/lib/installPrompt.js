/**
 * Catches `beforeinstallprompt` at module scope.
 *
 * Chrome fires this event once, within about a second of load. A listener
 * living inside a component is too late and too narrow: a first-time visitor
 * lands on /onboarding, the event fires there, and by the time the main tabs
 * mount it is gone for good — so the install banner would never appear for
 * exactly the users it is meant for.
 *
 * Imported from main.jsx before React renders, so the listener is attached
 * as early as the bundle allows.
 */

let deferredEvent = null
const listeners = new Set()

function emit() {
  for (const fn of listeners) fn(deferredEvent)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Suppress Chrome's own banner so ours is the only prompt shown.
    e.preventDefault()
    deferredEvent = e
    emit()
  })

  window.addEventListener('appinstalled', () => {
    deferredEvent = null
    emit()
  })
}

/** The stored event, or null when the app is not installable right now. */
export function getInstallPrompt() {
  return deferredEvent
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function onInstallPromptChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The event is single-use; drop it once it has been shown. */
export function clearInstallPrompt() {
  deferredEvent = null
  emit()
}

/** True when the app is already running from its home-screen icon. */
export function isInstalled() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true
  )
}

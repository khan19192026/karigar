import { supabase, hasSupabase } from './supabase'
import { auth } from './db'

/**
 * Web Push registration.
 *
 * What works with no extra infrastructure: an in-app notification while a tab
 * is open. What needs infrastructure: a notification when the app is closed —
 * that requires VAPID keys, the stored subscription below, and something
 * server-side to actually send it (see supabase/functions/send-push).
 *
 * The client half is complete either way, so turning the server half on is a
 * deployment step rather than a code change.
 */

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim()
const ASKED_KEY = 'karigar.push.asked'

export const pushConfigured = Boolean(VAPID_PUBLIC_KEY && hasSupabase)

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function permission() {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

/** True once the user has been asked, so we never nag twice. */
export function alreadyAsked() {
  return localStorage.getItem(ASKED_KEY) === '1'
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/**
 * Asks for permission and stores the subscription.
 * Returns 'granted' | 'denied' | 'unsupported' | 'unconfigured'.
 */
export async function enablePush() {
  if (!pushSupported()) return 'unsupported'
  localStorage.setItem(ASKED_KEY, '1')

  const result = await Notification.requestPermission()
  if (result !== 'granted') return 'denied'

  // Permission alone is enough for foreground notifications. Background
  // delivery needs the VAPID key and a server, so stop here without it
  // rather than failing loudly.
  if (!pushConfigured) return 'granted'

  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }))

    const me = await auth.current()
    if (!me) return 'granted'

    const json = subscription.toJSON()
    await supabase.from('push_subscriptions').upsert(
      {
        user_id: me.profile.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 300),
      },
      { onConflict: 'endpoint' },
    )
  } catch {
    // A failed subscribe still leaves foreground notifications working.
    return 'granted'
  }

  return 'granted'
}

/**
 * Shows a notification for a message that arrived while the app is open.
 *
 * This is the fallback that always works. Suppressed when the tab is visible,
 * because the user can already see the message land.
 */
export async function notifyLocally({ title, body, url = '/chats' }) {
  if (permission() !== 'granted') return
  if (document.visibilityState === 'visible') return

  try {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'karigar-chat',
      renotify: true,
      data: { url },
    })
  } catch {
    /* notifications unavailable — the in-app badge still updates */
  }
}

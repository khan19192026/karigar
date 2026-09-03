import { supabase, hasSupabase } from './supabase'
import { auth, getMyTechnicianProfile, isDemo } from './db'
import { putBlob } from './blobStore'
import { maskPhoneNumbers } from './format'

/**
 * Chat, media and the offer engine — one interface over both backends.
 *
 * On Supabase, writes go through RPCs so the thread preview and the
 * offer-supersede rule cannot be skipped, and reads come back live over
 * Realtime. The demo backend keeps threads in localStorage, media blobs in
 * IndexedDB, and fakes "realtime" with a storage event plus a short poll.
 */

const DB_KEY = 'karigar.db.v1'

/* ═══════════════════════════════════════════════════ demo store access ══ */

function readStore() {
  const raw = localStorage.getItem(DB_KEY)
  const store = raw ? JSON.parse(raw) : {}
  store.conversations ??= []
  store.messages ??= []
  return store
}

function writeStore(store) {
  localStorage.setItem(DB_KEY, JSON.stringify(store))
  // Same-tab listeners do not get a storage event, so nudge them directly.
  window.dispatchEvent(new CustomEvent('karigar:chat'))
}

function mutate(fn) {
  const store = readStore()
  const out = fn(store)
  writeStore(store)
  return out
}

const newId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`

/** Who am I, and which technician_profile is mine (if any)? */
async function whoAmI() {
  const me = await auth.current()
  if (!me) throw new Error('NOT_SIGNED_IN')
  const tech = await getMyTechnicianProfile()
  return { userId: me.profile.id, profile: me.profile, technicianId: tech?.id || null }
}

/* ══════════════════════════════════════════════════════════════ threads ══ */

/**
 * Finds or creates the thread with the other party. Pass whichever side you
 * are not — the caller's own end is taken from the session.
 */
export async function ensureConversation({ technicianId, customerId, requestId = null }) {
  if (hasSupabase) {
    const { data, error } = await supabase.rpc('ensure_conversation', {
      p_technician_id: technicianId || null,
      p_customer_id: customerId || null,
      p_request_id: requestId,
    })
    if (error) throw error
    return data
  }

  const me = await whoAmI()
  const custId = me.technicianId ? customerId : me.userId
  const techId = me.technicianId || technicianId
  if (!custId || !techId) throw new Error('MISSING_PARTY')

  return mutate((store) => {
    const found = store.conversations.find(
      (c) =>
        c.customer_id === custId &&
        c.technician_id === techId &&
        (requestId ? c.request_id === requestId : !c.request_id),
    )
    if (found) return found.id

    const row = {
      id: newId(),
      customer_id: custId,
      technician_id: techId,
      request_id: requestId,
      last_message_at: new Date().toISOString(),
      last_message_preview: null,
      created_at: new Date().toISOString(),
    }
    store.conversations.push(row)
    return row.id
  })
}

/** Conversation list for whoever is signed in, newest activity first. */
export async function listConversations() {
  const me = await whoAmI()

  if (hasSupabase) {
    // technician_profiles is no longer readable for other people (it carries
    // whatsapp_number), so the karigar's name comes from the contact-free
    // directory view in a second query rather than a PostgREST embed.
    const { data, error } = await supabase
      .from('conversations')
      .select('*, request:service_requests(id, title, status)')
      .order('last_message_at', { ascending: false })
    if (error) throw error

    const techIds = [...new Set((data || []).map((c) => c.technician_id).filter(Boolean))]
    const customerIds = [...new Set((data || []).map((c) => c.customer_id).filter(Boolean))]

    const [{ data: techs }, { data: unread }] = await Promise.all([
      techIds.length
        ? supabase
            .from('directory_technicians')
            .select('id, shop_name, address_area, is_verified, full_name')
            .in('id', techIds)
        : Promise.resolve({ data: [] }),
      supabase.from('messages').select('conversation_id').is('read_at', null).neq('sender_id', me.userId),
    ])

    const techById = Object.fromEntries((techs || []).map((t) => [t.id, t]))

    // A karigar needs the customer's name. Their own profile row is the only
    // one they can read, so for the technician side the name comes from the
    // reveal they already paid for, or falls back to a neutral label.
    let customerById = {}
    if (me.technicianId && customerIds.length) {
      const { data: revealed } = await supabase.rpc('my_revealed_contacts')
      customerById = Object.fromEntries(
        (revealed || []).map((r) => [r.technician_id, { full_name: r.full_name }]),
      )
    }

    const counts = {}
    for (const m of unread || []) counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1

    return (data || []).map((c) =>
      shapeConversation(
        {
          ...c,
          technician: techById[c.technician_id]
            ? {
                ...techById[c.technician_id],
                profile: { full_name: techById[c.technician_id].full_name },
              }
            : null,
          customer: customerById[c.customer_id] || null,
        },
        me,
        counts[c.id] || 0,
      ),
    )
  }

  const store = readStore()
  const mine = store.conversations.filter((c) =>
    me.technicianId ? c.technician_id === me.technicianId : c.customer_id === me.userId,
  )

  return mine
    .map((c) => {
      const tech = store.technician_profiles.find((t) => t.id === c.technician_id)
      const techProfile = store.profiles.find((p) => p.id === tech?.user_id)
      const customer = store.profiles.find((p) => p.id === c.customer_id)
      const request = store.service_requests.find((r) => r.id === c.request_id)
      const unread = store.messages.filter(
        (m) => m.conversation_id === c.id && !m.read_at && m.sender_id !== me.userId,
      ).length

      return shapeConversation(
        {
          ...c,
          technician: tech
            ? { ...tech, profile: techProfile ? { full_name: techProfile.full_name } : null }
            : null,
          customer: customer ? { full_name: customer.full_name } : null,
          request: request ? { id: request.id, title: request.title, status: request.status } : null,
        },
        me,
        unread,
      )
    })
    .sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at))
}

function shapeConversation(c, me, unread) {
  const iAmTechnician = Boolean(me.technicianId) && c.technician_id === me.technicianId
  const otherName = iAmTechnician
    ? c.customer?.full_name || 'Customer'
    : c.technician?.shop_name || c.technician?.profile?.full_name || 'Karigar'

  return {
    id: c.id,
    customer_id: c.customer_id,
    technician_id: c.technician_id,
    request_id: c.request_id,
    request_title: c.request?.title || null,
    request_status: c.request?.status || null,
    last_message_at: c.last_message_at,
    last_message_preview: c.last_message_preview,
    unread,
    i_am_technician: iAmTechnician,
    other_name: otherName,
    other_area: iAmTechnician ? null : c.technician?.address_area || null,
    other_verified: iAmTechnician ? false : Boolean(c.technician?.is_verified),
  }
}

export async function getConversation(id) {
  const all = await listConversations()
  return all.find((c) => c.id === id) || null
}

/* ═════════════════════════════════════════════════════════════ messages ══ */

export async function listMessages(conversationId) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data || []
  }
  return readStore()
    .messages.filter((m) => m.conversation_id === conversationId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
}

/**
 * Uploads chat media. Supabase Storage in production; IndexedDB in demo,
 * because a video as a base64 data URL would exceed localStorage on its own.
 */
export async function uploadChatMedia(blob, kind) {
  if (hasSupabase) {
    const me = await whoAmI()
    const ext =
      kind === 'image' ? 'jpg' : kind === 'video' ? (blob.type.includes('mp4') ? 'mp4' : 'webm') : 'webm'
    const path = `${me.userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage
      .from('chat-media')
      .upload(path, blob, { contentType: blob.type, upsert: false })
    if (error) throw error
    return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl
  }
  return putBlob(blob)
}

/**
 * Posts a message.
 *
 * Text is run through maskPhoneNumbers first. Without that, removing the
 * dialer buttons achieves nothing — chat simply becomes the new leak
 * channel, which is the opposite of the point.
 */
export async function sendMessage({
  conversationId,
  kind,
  body = null,
  mediaUrl = null,
  durationMs = null,
  sizeBytes = null,
  offerAmount = null,
}) {
  const safeBody =
    kind === 'text' || kind === 'offer' ? (body ? maskPhoneNumbers(body).text : body) : body

  if (hasSupabase) {
    const { data, error } = await supabase.rpc('send_message', {
      p_conversation_id: conversationId,
      p_kind: kind,
      p_body: safeBody,
      p_media_url: mediaUrl,
      p_duration_ms: durationMs,
      p_size_bytes: sizeBytes,
      p_offer_amount: offerAmount,
    })
    if (error) throw new Error(pgCode(error))
    return data
  }

  const me = await whoAmI()
  return mutate((store) => {
    if (kind === 'offer') {
      if (!offerAmount || offerAmount <= 0) throw new Error('INVALID_AMOUNT')
      for (const m of store.messages) {
        if (m.conversation_id === conversationId && m.kind === 'offer' && m.offer_status === 'pending') {
          m.offer_status = 'superseded'
        }
      }
    }

    const row = {
      id: newId(),
      conversation_id: conversationId,
      sender_id: me.userId,
      kind,
      body: safeBody,
      media_url: mediaUrl,
      media_duration_ms: durationMs,
      media_size_bytes: sizeBytes,
      offer_amount: offerAmount,
      offer_status: kind === 'offer' ? 'pending' : null,
      read_at: null,
      created_at: new Date().toISOString(),
    }
    store.messages.push(row)

    const conv = store.conversations.find((c) => c.id === conversationId)
    if (conv) {
      conv.last_message_at = row.created_at
      conv.last_message_preview = previewFor(kind, safeBody, offerAmount)
    }
    return row
  })
}

function previewFor(kind, body, amount) {
  switch (kind) {
    case 'text':
      return String(body || '').slice(0, 120)
    case 'voice':
      return 'Voice note'
    case 'image':
      return 'Photo'
    case 'video':
      return 'Video'
    case 'offer':
      return `Offer: PKR ${amount}`
    default:
      return body || ''
  }
}

export async function markRead(conversationId) {
  if (hasSupabase) {
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
    return
  }

  const me = await whoAmI()
  const store = readStore()
  const unreadRows = store.messages.filter(
    (m) => m.conversation_id === conversationId && m.sender_id !== me.userId && !m.read_at,
  )

  // Bail out when there is nothing to mark. Writing unconditionally would
  // fire the change event that the thread subscribes to, which reloads the
  // thread, which marks read again — an infinite loop that locks the tab.
  if (unreadRows.length === 0) return

  const now = new Date().toISOString()
  for (const m of unreadRows) m.read_at = now
  writeStore(store)
}

export async function unreadCount() {
  if (hasSupabase) {
    const { data, error } = await supabase.rpc('my_unread_count')
    if (error) return 0
    return Number(data) || 0
  }
  try {
    const me = await whoAmI()
    const store = readStore()
    const mine = new Set(
      store.conversations
        .filter((c) => (me.technicianId ? c.technician_id === me.technicianId : c.customer_id === me.userId))
        .map((c) => c.id),
    )
    return store.messages.filter((m) => mine.has(m.conversation_id) && !m.read_at && m.sender_id !== me.userId)
      .length
  } catch {
    return 0
  }
}

/* ══════════════════════════════════════════════════════════════ offers ══ */

export async function acceptOffer(messageId) {
  if (hasSupabase) {
    const { data, error } = await supabase.rpc('accept_offer', { p_message_id: messageId })
    if (error) throw new Error(pgCode(error))
    return data
  }

  const me = await whoAmI()
  const { CONFIG_DEFAULTS } = await import('./constants')

  return mutate((store) => {
    const msg = store.messages.find((m) => m.id === messageId)
    if (!msg || msg.kind !== 'offer') throw new Error('OFFER_NOT_FOUND')
    if (msg.offer_status !== 'pending') throw new Error('OFFER_NOT_PENDING')
    if (msg.sender_id === me.userId) throw new Error('CANNOT_ACCEPT_OWN_OFFER')

    const conv = store.conversations.find((c) => c.id === msg.conversation_id)
    const tech = store.technician_profiles.find((t) => t.id === conv.technician_id)

    const cfg = { ...CONFIG_DEFAULTS, ...store.app_config }
    const frozen =
      tech.lead_access_frozen_until && new Date(tech.lead_access_frozen_until) > new Date()
    const unconfirmed = store.service_requests.filter(
      (r) => r.assigned_technician_id === tech.id && r.status === 'assigned',
    ).length

    if (frozen) throw new Error('FROZEN')
    if (Number(tech.wallet_balance) < 0) throw new Error('NEGATIVE_BALANCE')
    if (unconfirmed >= (Number(cfg.max_unconfirmed_jobs) || 2)) throw new Error('TOO_MANY_UNCONFIRMED')

    let requestId = conv.request_id
    if (!requestId) {
      requestId = newId()
      store.service_requests.unshift({
        id: requestId,
        customer_id: conv.customer_id,
        category_id: tech.category_id,
        title: msg.body || 'Chat par tay hua kaam',
        description: msg.body || null,
        audio_note_url: null,
        area_location: tech.address_area,
        proposed_budget: msg.offer_amount,
        agreed_amount: msg.offer_amount,
        status: 'assigned',
        assigned_technician_id: tech.id,
        assigned_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      conv.request_id = requestId
    } else {
      const req = store.service_requests.find((r) => r.id === requestId)
      req.agreed_amount = msg.offer_amount
      req.status = 'assigned'
      req.assigned_technician_id = tech.id
      req.assigned_at = req.assigned_at || new Date().toISOString()
    }

    msg.offer_status = 'accepted'

    store.messages.push({
      id: newId(),
      conversation_id: conv.id,
      sender_id: me.userId,
      kind: 'system',
      body: `Offer accept ho gaya — PKR ${msg.offer_amount}. Kaam shuru.`,
      media_url: null,
      offer_status: null,
      read_at: null,
      created_at: new Date().toISOString(),
    })

    conv.last_message_at = new Date().toISOString()
    conv.last_message_preview = `Offer accepted: PKR ${msg.offer_amount}`

    return { request_id: requestId, amount: msg.offer_amount }
  })
}

export async function declineOffer(messageId) {
  if (hasSupabase) {
    const { error } = await supabase.rpc('decline_offer', { p_message_id: messageId })
    if (error) throw new Error(pgCode(error))
    return
  }
  const me = await whoAmI()
  mutate((store) => {
    const msg = store.messages.find((m) => m.id === messageId)
    if (!msg) throw new Error('OFFER_NOT_FOUND')
    if (msg.sender_id === me.userId) throw new Error('CANNOT_DECLINE_OWN_OFFER')
    if (msg.offer_status === 'pending') msg.offer_status = 'declined'
  })
}

/* ════════════════════════════════════════════════════════════ realtime ══ */

/**
 * Subscribes to new messages in a thread.
 *
 * Supabase pushes over a WebSocket. The demo backend has no server, so it
 * listens for storage events (other tabs) plus a custom event (same tab) —
 * enough to demo two roles side by side in two windows.
 */
export function subscribeToMessages(conversationId, onChange) {
  if (hasSupabase) {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => onChange(),
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }

  const handler = () => onChange()
  window.addEventListener('storage', handler)
  window.addEventListener('karigar:chat', handler)
  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener('karigar:chat', handler)
  }
}

/** Subscribes to any change affecting my thread list or unread badge. */
export function subscribeToInbox(onChange) {
  if (hasSupabase) {
    const channel = supabase
      .channel('inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => onChange())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }
  const handler = () => onChange()
  window.addEventListener('storage', handler)
  window.addEventListener('karigar:chat', handler)
  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener('karigar:chat', handler)
  }
}

function pgCode(error) {
  const known = [
    'NOT_A_PARTICIPANT',
    'ACCOUNT_BANNED',
    'INVALID_AMOUNT',
    'OFFER_NOT_FOUND',
    'OFFER_NOT_PENDING',
    'NOT_AN_OFFER',
    'CANNOT_ACCEPT_OWN_OFFER',
    'CANNOT_DECLINE_OWN_OFFER',
    'FROZEN',
    'NEGATIVE_BALANCE',
    'TOO_MANY_UNCONFIRMED',
    'MISSING_PARTY',
  ]
  return known.find((c) => error.message?.includes(c)) || error.message || 'UNKNOWN'
}

export { isDemo }

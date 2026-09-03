import { supabase, hasSupabase, authMode } from './supabase'
import { buildDemoSeed } from './demoData'
import { CONFIG_DEFAULTS } from './constants'
import { maskPhoneNumbers, toE164 } from './format'

/**
 * One data interface, two backends.
 *
 *   supabase — the real thing, once VITE_SUPABASE_URL/ANON_KEY are set.
 *   demo     — localStorage, seeded with D.I. Khan content, zero config.
 *
 * Every function below is async and returns the same shape from either
 * backend, so no screen ever needs to know which one is running.
 */

const DB_KEY = 'karigar.db.v1'
const SESSION_KEY = 'karigar.session.v1'

export const backend = hasSupabase ? 'supabase' : 'demo'
export const isDemo = backend === 'demo'

/* ═══════════════════════════════════════════════════ demo store plumbing ══ */

function readStore() {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const store = JSON.parse(raw)
      // Backfill collections added after this device first seeded, so an
      // existing install does not crash on an undefined array.
      store.technician_strikes ??= []
      store.blocked_identities ??= []
      store.contact_reveals ??= []
      store.conversations ??= []
      store.messages ??= []
      store.lead_unlocks ??= []
      store.wallet_transactions ??= []
      store.app_config = { ...CONFIG_DEFAULTS, ...store.app_config }
      for (const t of store.technician_profiles || []) {
        t.strike_count ??= 0
        t.jobs_completed ??= 0
        t.lead_access_frozen_until ??= null
      }
      return store
    }
  } catch {
    /* corrupt payload — fall through and reseed */
  }
  const seed = {
    ...buildDemoSeed(),
    app_config: { ...CONFIG_DEFAULTS },
    lead_unlocks: [],
    wallet_transactions: [],
    technician_strikes: [],
    blocked_identities: [],
    contact_reveals: [],
    conversations: [],
    messages: [],
  }
  writeStore(seed)
  return seed
}

/** localStorage has a hard quota and voice notes are the only thing large
 *  enough to hit it. Surface that as a real error rather than a silent drop. */
function writeStore(next) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(next))
    return true
  } catch (err) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      throw new Error('STORAGE_FULL')
    }
    throw err
  }
}

function mutate(fn) {
  const store = readStore()
  const result = fn(store)
  writeStore(store)
  return result
}

const newId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${performance.now()}`

/* ═══════════════════════════════════════════════════════════════ session ══ */

function localSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

function setLocalSession(value) {
  if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value))
  else localStorage.removeItem(SESSION_KEY)
}

/* ═════════════════════════════════════════════════════════════════ shape ══ */

/** Flattens the technician + profile + category join into the single object
 *  the cards render from. Both backends emit this. */
function shapeTechnician(row, profile, category) {
  return {
    id: row.id,
    user_id: row.user_id,
    full_name: profile?.full_name || 'Karigar',
    phone_number: profile?.phone_number || null,
    avatar_url: profile?.avatar_url || null,
    shop_name: row.shop_name,
    address_area: row.address_area,
    experience_years: row.experience_years ?? 1,
    rating: Number(row.rating ?? 5),
    is_verified: Boolean(row.is_verified),
    is_available: row.is_available !== false,
    wallet_balance: Number(row.wallet_balance ?? 0),
    whatsapp_number: row.whatsapp_number || profile?.phone_number || null,
    cnic_number: row.cnic_number || null,
    jobs_completed: Number(row.jobs_completed ?? 0),
    // Can a paid reveal succeed right now? False when the karigar's balance
    // cannot cover the fee, which takes them out of the contact flow.
    is_contactable: row.is_contactable !== false,
    category_id: row.category_id,
    category_name: category?.name_en || null,
    icon_name: category?.icon_name || 'default',
    created_at: row.created_at,
  }
}

const num = (v) => (v == null ? null : Number(v))

function shapeRequest(row, category) {
  return {
    id: row.id,
    customer_id: row.customer_id,
    title: row.title,
    description: row.description,
    audio_note_url: row.audio_note_url,
    area_location: row.area_location,
    proposed_budget: num(row.proposed_budget),
    status: row.status,
    created_at: row.created_at,
    category_id: row.category_id,
    category_name: category?.name_en || null,
    icon_name: category?.icon_name || 'default',
    // Lifecycle and audit fields. Every one of these must be listed: this
    // function is an allow-list, so anything missing silently reads as
    // undefined downstream and renders as PKR 0.
    assigned_technician_id: row.assigned_technician_id || null,
    assigned_at: row.assigned_at || null,
    agreed_amount: num(row.agreed_amount),
    technician_amount: num(row.technician_amount),
    technician_finished_at: row.technician_finished_at || null,
    customer_amount: num(row.customer_amount),
    customer_confirmed_at: row.customer_confirmed_at || null,
    customer_rating: num(row.customer_rating),
    commission_charged: num(row.commission_charged),
    has_discrepancy: Boolean(row.has_discrepancy),
    closed_reason: row.closed_reason || null,
  }
}

/* ══════════════════════════════════════════════════════════════════ auth ══ */

export const auth = {
  /**
   * Returns { profile } or null.
   * In demo/local mode the phone number is trusted as-is — documented in
   * .env.example as pilot-only. In `otp` mode Supabase has already verified it.
   */
  async current() {
    if (hasSupabase) {
      const { data } = await supabase.auth.getSession()
      const uid = data?.session?.user?.id
      if (!uid) return null
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      return profile ? { profile } : null
    }
    const s = localSession()
    if (!s?.userId) return null
    const store = readStore()
    const profile = store.profiles.find((p) => p.id === s.userId)
    return profile ? { profile } : null
  },

  /** Step one of OTP sign-in. Only used when VITE_AUTH_MODE=otp. */
  async requestOtp(phone) {
    const e164 = toE164(phone)
    if (!e164) throw new Error('INVALID_PHONE')
    if (!(hasSupabase && authMode === 'otp')) return { skipped: true }
    const { error } = await supabase.auth.signInWithOtp({ phone: `+${e164}` })
    if (error) throw error
    return { sent: true }
  },

  async verifyOtp(phone, token) {
    const e164 = toE164(phone)
    const { error } = await supabase.auth.verifyOtp({ phone: `+${e164}`, token, type: 'sms' })
    if (error) throw error
  },

  /**
   * Creates or resumes an account. `role` is 'customer' | 'technician'.
   * Returns the profile row.
   */
  async signIn({ phone, full_name, role = 'customer' }) {
    const e164 = toE164(phone)
    if (!e164) throw new Error('INVALID_PHONE')

    if (hasSupabase) {
      const { data: sessionData } = await supabase.auth.getSession()
      let uid = sessionData?.session?.user?.id

      if (!uid) {
        // No SMS provider configured: sign in anonymously and attach the
        // phone number to the profile. Swap VITE_AUTH_MODE to `otp` for the
        // real verified flow.
        const { data, error } = await supabase.auth.signInAnonymously({
          options: { data: { full_name, phone_number: e164, user_role: role } },
        })
        if (error) throw error
        uid = data.user.id
      }

      const { data: existing } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      if (existing) {
        const { data: updated } = await supabase
          .from('profiles')
          .update({ full_name, phone_number: e164, user_role: role })
          .eq('id', uid)
          .select()
          .single()
        return updated
      }
      const { data: created, error } = await supabase
        .from('profiles')
        .insert({ id: uid, full_name, phone_number: e164, user_role: role })
        .select()
        .single()
      if (error) throw error
      return created
    }

    // Demo backend. Signing in with a seeded technician's number resumes
    // that karigar's account, which makes the lead centre demo-able.
    return mutate((store) => {
      let profile = store.profiles.find((p) => toE164(p.phone_number) === e164)
      if (profile) {
        profile.full_name = full_name || profile.full_name
        profile.user_role = role
      } else {
        profile = {
          id: newId(),
          full_name: full_name || 'Karigar user',
          phone_number: e164,
          user_role: role,
          avatar_url: null,
          created_at: new Date().toISOString(),
        }
        store.profiles.push(profile)
      }
      setLocalSession({ userId: profile.id })
      return profile
    })
  },

  async updateProfile(patch) {
    const me = await auth.current()
    if (!me) throw new Error('NOT_SIGNED_IN')
    if (hasSupabase) {
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', me.profile.id)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return mutate((store) => {
      const p = store.profiles.find((x) => x.id === me.profile.id)
      Object.assign(p, patch)
      return p
    })
  },

  async signOut() {
    if (hasSupabase) await supabase.auth.signOut()
    setLocalSession(null)
  },

  /** Wipes the demo database back to its seeded state. */
  async resetDemo() {
    localStorage.removeItem(DB_KEY)
    localStorage.removeItem(SESSION_KEY)
  },
}

/* ════════════════════════════════════════════════════════════════ config ══ */

export async function getConfig() {
  if (hasSupabase) {
    const { data, error } = await supabase.from('app_config').select('key, value')
    if (error) return { ...CONFIG_DEFAULTS }
    const out = { ...CONFIG_DEFAULTS }
    for (const row of data || []) out[row.key] = row.value
    return out
  }
  return { ...CONFIG_DEFAULTS, ...readStore().app_config }
}

export async function setConfig(key, value) {
  if (hasSupabase) {
    const { error } = await supabase.from('app_config').upsert({ key, value }, { onConflict: 'key' })
    if (error) throw error
    return
  }
  mutate((store) => {
    store.app_config[key] = value
  })
}

/* ════════════════════════════════════════════════════════════ categories ══ */

export async function listCategories() {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    if (error) throw error
    return data || []
  }
  return readStore()
    .categories.filter((c) => c.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
}

/* ═══════════════════════════════════════════════════════════ technicians ══ */

export async function listTechnicians({ area, categoryId, query } = {}) {
  let rows

  if (hasSupabase) {
    // The view, never the table: it carries no phone number, which is what
    // makes the contact paywall real rather than cosmetic.
    let q = supabase.from('directory_technicians').select('*')
    if (area) q = q.eq('address_area', area)
    if (categoryId) q = q.eq('category_id', categoryId)
    const { data, error } = await q
    if (error) throw error

    const { data: cats } = await supabase.from('categories').select('*')
    const byId = Object.fromEntries((cats || []).map((c) => [c.id, c]))

    rows = (data || []).map((r) =>
      shapeTechnician(
        { ...r, whatsapp_number: null, wallet_balance: 0 },
        { full_name: r.full_name, phone_number: null, avatar_url: r.avatar_url },
        byId[r.category_id],
      ),
    )
  } else {
    const store = readStore()
    rows = store.technician_profiles
      .filter((t) => (area ? t.address_area === area : true))
      .filter((t) => (categoryId ? t.category_id === categoryId : true))
      // A banned karigar leaves the directory. Mirrors the directory view.
      .filter((t) => !store.profiles.find((p) => p.id === t.user_id)?.is_banned)
      .map((t) => {
        const cfg = { ...CONFIG_DEFAULTS, ...store.app_config }
        const charging = cfg.directory_charge_active === true || cfg.directory_charge_active === 'true'
        const cost = Number(cfg.directory_contact_cost) || 0
        const profile = store.profiles.find((p) => p.id === t.user_id)
        return shapeTechnician(
          {
            ...t,
            whatsapp_number: null,
            is_contactable: !charging || Number(t.wallet_balance) >= cost,
          },
          // phone_number is nulled here too, so the demo backend cannot leak
          // what the Supabase view withholds — both behave identically.
          { full_name: profile?.full_name, phone_number: null, avatar_url: profile?.avatar_url },
          store.categories.find((c) => c.id === t.category_id),
        )
      })
  }

  if (query) {
    const q = query.toLowerCase()
    rows = rows.filter((t) =>
      [t.full_name, t.shop_name, t.address_area, t.category_name]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(q)),
    )
  }

  // Verified pros surface first — that badge is the whole trust proposition.
  return rows.sort(
    (a, b) => Number(b.is_verified) - Number(a.is_verified) || b.rating - a.rating,
  )
}

export async function listTopTechnicians(limit = 8) {
  const all = await listTechnicians()
  return all.filter((t) => t.is_verified).slice(0, limit)
}

export async function getMyTechnicianProfile() {
  const me = await auth.current()
  if (!me) return null

  if (hasSupabase) {
    const { data } = await supabase
      .from('technician_profiles')
      .select('*, profile:profiles!technician_profiles_user_id_fkey(full_name, phone_number, avatar_url), category:categories(*)')
      .eq('user_id', me.profile.id)
      .maybeSingle()
    return data ? shapeTechnician(data, data.profile, data.category) : null
  }

  const store = readStore()
  const row = store.technician_profiles.find((t) => t.user_id === me.profile.id)
  if (!row) return null
  return shapeTechnician(
    row,
    store.profiles.find((p) => p.id === row.user_id),
    store.categories.find((c) => c.id === row.category_id),
  )
}

export async function upsertTechnicianProfile(input) {
  const me = await auth.current()
  if (!me) throw new Error('NOT_SIGNED_IN')

  const payload = {
    user_id: me.profile.id,
    category_id: input.category_id,
    shop_name: input.shop_name || null,
    address_area: input.address_area,
    experience_years: Number(input.experience_years) || 1,
    cnic_number: input.cnic_number || null,
    whatsapp_number: toE164(input.whatsapp_number) || me.profile.phone_number,
  }

  if (hasSupabase) {
    const { data, error } = await supabase
      .from('technician_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()
    if (error) throw error
    return data
  }

  return mutate((store) => {
    let row = store.technician_profiles.find((t) => t.user_id === me.profile.id)
    if (row) {
      Object.assign(row, payload)
    } else {
      row = {
        id: newId(),
        ...payload,
        is_verified: false,
        wallet_balance: 0,
        rating: 5,
        is_available: true,
        created_at: new Date().toISOString(),
      }
      store.technician_profiles.push(row)
    }
    return row
  })
}

export async function setAvailability(isAvailable) {
  const mine = await getMyTechnicianProfile()
  if (!mine) throw new Error('NO_TECHNICIAN_PROFILE')
  if (hasSupabase) {
    const { error } = await supabase
      .from('technician_profiles')
      .update({ is_available: isAvailable })
      .eq('id', mine.id)
    if (error) throw error
    return
  }
  mutate((store) => {
    const row = store.technician_profiles.find((t) => t.id === mine.id)
    row.is_available = isAvailable
  })
}

/* ══════════════════════════════════════════════════════════════ requests ══ */

export async function listOpenRequests({ area, categoryId } = {}) {
  if (hasSupabase) {
    let q = supabase
      .from('service_requests')
      .select('*, category:categories(*)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    if (area) q = q.eq('area_location', area)
    if (categoryId) q = q.eq('category_id', categoryId)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map((r) => shapeRequest(r, r.category))
  }

  const store = readStore()
  return store.service_requests
    .filter((r) => r.status === 'open')
    .filter((r) => (area ? r.area_location === area : true))
    .filter((r) => (categoryId ? r.category_id === categoryId : true))
    // Never sell a lead belonging to a banned customer.
    .filter((r) => !store.profiles.find((p) => p.id === r.customer_id)?.is_banned)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((r) => shapeRequest(r, store.categories.find((c) => c.id === r.category_id)))
}

export async function listMyRequests() {
  const me = await auth.current()
  if (!me) return []

  if (hasSupabase) {
    const { data, error } = await supabase
      .from('service_requests')
      .select('*, category:categories(*)')
      .eq('customer_id', me.profile.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((r) => shapeRequest(r, r.category))
  }

  const store = readStore()
  return store.service_requests
    .filter((r) => r.customer_id === me.profile.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((r) => shapeRequest(r, store.categories.find((c) => c.id === r.category_id)))
}

export async function createRequest(input) {
  const me = await auth.current()
  if (!me) throw new Error('NOT_SIGNED_IN')
  if (me.profile.is_banned) throw new Error('ACCOUNT_BANNED')

  let audio_note_url = null
  if (input.audioBlob) {
    audio_note_url = await uploadVoiceNote(input.audioBlob, me.profile.id)
  }

  // Strip any phone number the customer typed into the free text. This is
  // the single choke point for it, so neither backend can skip the step.
  const title = maskPhoneNumbers(input.title).text
  const description = input.description ? maskPhoneNumbers(input.description).text : null

  const payload = {
    customer_id: me.profile.id,
    category_id: input.category_id,
    title,
    description,
    audio_note_url,
    area_location: input.area_location,
    proposed_budget: input.proposed_budget ? Number(input.proposed_budget) : null,
    status: 'open',
  }

  if (hasSupabase) {
    const { data, error } = await supabase.from('service_requests').insert(payload).select('*, category:categories(*)').single()
    if (error) throw error
    return shapeRequest(data, data.category)
  }

  return mutate((store) => {
    const row = { id: newId(), ...payload, created_at: new Date().toISOString() }
    store.service_requests.unshift(row)
    return shapeRequest(row, store.categories.find((c) => c.id === row.category_id))
  })
}

export async function updateRequestStatus(id, status) {
  if (hasSupabase) {
    const { error } = await supabase.from('service_requests').update({ status }).eq('id', id)
    if (error) throw error
    return
  }
  mutate((store) => {
    const row = store.service_requests.find((r) => r.id === id)
    if (row) row.status = status
  })
}

/* ═══════════════════════════════════════════════════════════ voice notes ══ */

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function uploadVoiceNote(blob, ownerId) {
  if (hasSupabase) {
    const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
    const path = `${ownerId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('voice-notes')
      .upload(path, blob, { contentType: blob.type, upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('voice-notes').getPublicUrl(path)
    return data.publicUrl
  }
  // Demo backend keeps the clip inline as a data URL so it survives a
  // reload. writeStore throws STORAGE_FULL if the quota is hit.
  return blobToDataUrl(blob)
}

/* ═════════════════════════════════════════════════════════ leads & money ══ */

export async function listMyUnlocks() {
  const mine = await getMyTechnicianProfile()
  if (!mine) return []

  if (hasSupabase) {
    const { data, error } = await supabase.from('lead_unlocks').select('*').eq('technician_id', mine.id)
    if (error) throw error
    return data || []
  }
  return readStore().lead_unlocks.filter((u) => u.technician_id === mine.id)
}

/**
 * Contacts this technician has already paid for, keyed by request id.
 *
 * Without this a karigar who bought a lead, then closed the app, would come
 * back to a locked-looking card — they paid for the number, so it has to
 * survive a reload.
 */
export async function listUnlockedContacts() {
  const mine = await getMyTechnicianProfile()
  if (!mine) return {}

  if (hasSupabase) {
    const { data, error } = await supabase.rpc('my_unlocked_contacts')
    if (error) return {}
    return Object.fromEntries(
      (data || []).map((r) => [r.request_id, { full_name: r.full_name, phone_number: r.phone_number }]),
    )
  }

  const store = readStore()
  const out = {}
  for (const unlock of store.lead_unlocks.filter((u) => u.technician_id === mine.id)) {
    const request = store.service_requests.find((r) => r.id === unlock.request_id)
    const customer = store.profiles.find((p) => p.id === request?.customer_id)
    if (customer) {
      out[unlock.request_id] = {
        full_name: customer.full_name,
        phone_number: customer.phone_number,
      }
    }
  }
  return out
}

/**
 * Buys a lead. Returns { charged, was_free, wallet_balance, full_name,
 * phone_number } or throws 'INSUFFICIENT_BALANCE'.
 *
 * On Supabase this is a single SECURITY DEFINER transaction — the browser
 * never touches wallet_balance. The demo branch mirrors that logic exactly
 * so both backends behave identically.
 */
export async function unlockLead(requestId) {
  if (hasSupabase) {
    const { data, error } = await supabase.rpc('unlock_lead', { p_request_id: requestId })
    if (error) {
      if (error.message?.includes('INSUFFICIENT_BALANCE')) throw new Error('INSUFFICIENT_BALANCE')
      throw error
    }
    return data
  }

  const me = await auth.current()
  if (me?.profile?.is_banned) throw new Error('ACCOUNT_BANNED')

  const mine = await getMyTechnicianProfile()
  if (!mine) throw new Error('NOT_A_TECHNICIAN')

  // Same gate the SQL function applies: freeze, unpaid commission and the
  // unconfirmed-job cap all block a purchase.
  const gate = await getTechnicianGate()
  if (gate.blocked_reason) throw new Error(gate.blocked_reason)

  return mutate((store) => {
    const tech = store.technician_profiles.find((t) => t.id === mine.id)
    const request = store.service_requests.find((r) => r.id === requestId)
    if (!request) throw new Error('REQUEST_NOT_FOUND')
    const customer = store.profiles.find((p) => p.id === request.customer_id)

    const existing = store.lead_unlocks.find(
      (u) => u.technician_id === tech.id && u.request_id === requestId,
    )
    if (existing) {
      return {
        already_unlocked: true,
        charged: 0,
        wallet_balance: tech.wallet_balance,
        full_name: customer?.full_name,
        phone_number: customer?.phone_number,
      }
    }

    const cfg = { ...CONFIG_DEFAULTS, ...store.app_config }
    const monetized = cfg.monetization_active === true || cfg.monetization_active === 'true'
    const cost = Number(cfg.lead_unlock_cost) || 0
    const allowance = Number(cfg.free_leads_allowance) || 0

    let charge = 0
    let wasFree = false

    if (monetized) {
      const freeUsed = store.lead_unlocks.filter((u) => u.technician_id === tech.id && u.was_free).length
      if (freeUsed < allowance) {
        wasFree = true
      } else if (tech.wallet_balance >= cost) {
        charge = cost
      } else {
        throw new Error('INSUFFICIENT_BALANCE')
      }
    }

    tech.wallet_balance = Number(tech.wallet_balance) - charge

    store.lead_unlocks.push({
      id: newId(),
      technician_id: tech.id,
      request_id: requestId,
      cost_paid: charge,
      was_free: wasFree,
      created_at: new Date().toISOString(),
    })

    if (charge > 0) {
      store.wallet_transactions.unshift({
        id: newId(),
        technician_id: tech.id,
        amount: -charge,
        kind: 'lead_unlock',
        reference: requestId,
        balance_after: tech.wallet_balance,
        created_at: new Date().toISOString(),
      })
    }

    return {
      already_unlocked: false,
      charged: charge,
      was_free: wasFree,
      wallet_balance: tech.wallet_balance,
      full_name: customer?.full_name,
      phone_number: customer?.phone_number,
    }
  })
}

export async function listWalletTransactions() {
  const mine = await getMyTechnicianProfile()
  if (!mine) return []
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('technician_id', mine.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return data || []
  }
  return readStore().wallet_transactions.filter((t) => t.technician_id === mine.id)
}

/* ═══════════════════════════════════════════ directory contact reveal ══ */

/**
 * Charges the karigar and returns their contact details.
 *
 * The fee lands before the call connects, so it does not matter whether the
 * deal then happens on the phone, on WhatsApp, or at the customer's door.
 *
 * Throws 'TECHNICIAN_UNAVAILABLE' when the karigar cannot cover the fee.
 * That is deliberate: an inbound directory call is not something the karigar
 * asked for, so billing them into debt for it would be indefensible. They
 * simply stop being contactable until they top up.
 */
export async function revealContact(technicianId) {
  if (hasSupabase) {
    const { data, error } = await supabase.rpc('reveal_contact', {
      p_technician_id: technicianId,
    })
    if (error) throw new Error(extractPgError(error))
    return data
  }

  const me = await auth.current()
  if (!me) throw new Error('NOT_SIGNED_IN')
  if (me.profile.is_banned) throw new Error('ACCOUNT_BANNED')

  return mutate((store) => {
    const cfg = { ...CONFIG_DEFAULTS, ...store.app_config }
    const tech = store.technician_profiles.find((t) => t.id === technicianId)
    if (!tech) throw new Error('TECHNICIAN_NOT_FOUND')
    const owner = store.profiles.find((p) => p.id === tech.user_id)
    if (owner?.is_banned) throw new Error('TECHNICIAN_UNAVAILABLE')

    const windowMs = (Number(cfg.contact_dedupe_days) || 7) * 86400e3
    const existing = (store.contact_reveals ||= []).find(
      (r) =>
        r.customer_id === me.profile.id &&
        r.technician_id === technicianId &&
        Date.now() - new Date(r.created_at).getTime() < windowMs,
    )

    const contact = {
      full_name: owner?.full_name,
      phone_number: owner?.phone_number,
      whatsapp_number: tech.whatsapp_number || owner?.phone_number,
    }

    if (existing) return { already_revealed: true, charged: 0, ...contact }

    const charging = cfg.directory_charge_active === true || cfg.directory_charge_active === 'true'
    const cost = Number(cfg.directory_contact_cost) || 0
    const allowance = Number(cfg.free_leads_allowance) || 0

    let charge = 0
    let wasFree = false

    if (charging) {
      const freeUsed =
        store.lead_unlocks.filter((u) => u.technician_id === tech.id && u.was_free).length +
        store.contact_reveals.filter((r) => r.technician_id === tech.id && r.was_free).length

      if (freeUsed < allowance) wasFree = true
      else if (Number(tech.wallet_balance) >= cost) charge = cost
      else throw new Error('TECHNICIAN_UNAVAILABLE')
    }

    tech.wallet_balance = Number(tech.wallet_balance) - charge

    store.contact_reveals.unshift({
      id: newId(),
      customer_id: me.profile.id,
      technician_id: technicianId,
      cost_paid: charge,
      was_free: wasFree,
      refunded: false,
      refund_reason: null,
      created_at: new Date().toISOString(),
    })

    if (charge > 0) {
      store.wallet_transactions.unshift({
        id: newId(),
        technician_id: tech.id,
        amount: -charge,
        kind: 'lead_unlock',
        reference: 'directory-contact',
        balance_after: tech.wallet_balance,
        created_at: new Date().toISOString(),
      })
    }

    return { already_revealed: false, charged: charge, was_free: wasFree, ...contact }
  })
}

/** Contacts this customer already paid for, keyed by technician id. */
export async function listRevealedContacts() {
  const me = await auth.current()
  if (!me) return {}

  if (hasSupabase) {
    const { data, error } = await supabase.rpc('my_revealed_contacts')
    if (error) return {}
    return Object.fromEntries(
      (data || []).map((r) => [
        r.technician_id,
        { full_name: r.full_name, phone_number: r.phone_number, whatsapp_number: r.whatsapp_number },
      ]),
    )
  }

  const store = readStore()
  const cfg = { ...CONFIG_DEFAULTS, ...store.app_config }
  const windowMs = (Number(cfg.contact_dedupe_days) || 7) * 86400e3
  const out = {}

  for (const r of store.contact_reveals || []) {
    if (r.customer_id !== me.profile.id) continue
    if (Date.now() - new Date(r.created_at).getTime() >= windowMs) continue
    const tech = store.technician_profiles.find((t) => t.id === r.technician_id)
    const owner = store.profiles.find((p) => p.id === tech?.user_id)
    if (!tech || !owner) continue
    out[r.technician_id] = {
      full_name: owner.full_name,
      phone_number: owner.phone_number,
      whatsapp_number: tech.whatsapp_number || owner.phone_number,
    }
  }
  return out
}

/* ══════════════════════════════════════════════════════ job lifecycle ══ */

/** Mirrors the technician_gate() SQL function for the demo backend. */
function demoGate(store, tech) {
  const cfg = { ...CONFIG_DEFAULTS, ...store.app_config }
  const max = Number(cfg.max_unconfirmed_jobs) || 2
  const unconfirmed = store.service_requests.filter(
    (r) => r.assigned_technician_id === tech.id && r.status === 'assigned',
  ).length
  const frozenUntil = tech.lead_access_frozen_until
  const isFrozen = Boolean(frozenUntil && new Date(frozenUntil) > new Date())
  const profile = store.profiles.find((p) => p.id === tech.user_id)

  let blocked = null
  if (profile?.is_banned) blocked = 'BANNED'
  else if (isFrozen) blocked = 'FROZEN'
  else if (Number(tech.wallet_balance) < 0) blocked = 'NEGATIVE_BALANCE'
  else if (unconfirmed >= max) blocked = 'TOO_MANY_UNCONFIRMED'

  return {
    is_technician: true,
    technician_id: tech.id,
    wallet_balance: Number(tech.wallet_balance),
    strike_count: Number(tech.strike_count) || 0,
    frozen_until: frozenUntil,
    is_frozen: isFrozen,
    unconfirmed_jobs: unconfirmed,
    max_unconfirmed: max,
    jobs_completed: Number(tech.jobs_completed) || 0,
    blocked_reason: blocked,
  }
}

/** Can this karigar take leads right now, and if not, why not? */
export async function getTechnicianGate() {
  if (hasSupabase) {
    const { data, error } = await supabase.rpc('technician_gate')
    if (error) return { is_technician: false }
    return data
  }
  const me = await auth.current()
  if (!me) return { is_technician: false }
  const store = readStore()
  const tech = store.technician_profiles.find((t) => t.user_id === me.profile.id)
  if (!tech) return { is_technician: false }
  return demoGate(store, tech)
}

/** Jobs currently assigned to this karigar, in any live status. */
export async function listMyAssignedJobs() {
  const mine = await getMyTechnicianProfile()
  if (!mine) return []

  if (hasSupabase) {
    const { data, error } = await supabase
      .from('service_requests')
      .select('*, category:categories(*)')
      .eq('assigned_technician_id', mine.id)
      .in('status', ['assigned', 'awaiting_confirmation'])
      .order('assigned_at', { ascending: true })
    if (error) throw error
    return (data || []).map((r) => shapeRequest(r, r.category))
  }

  const store = readStore()
  return store.service_requests
    .filter((r) => r.assigned_technician_id === mine.id)
    .filter((r) => r.status === 'assigned' || r.status === 'awaiting_confirmation')
    .sort((a, b) => new Date(a.assigned_at || 0) - new Date(b.assigned_at || 0))
    .map((r) => shapeRequest(r, store.categories.find((c) => c.id === r.category_id)))
}

/** Karigar takes a job they already paid to unlock. First claim wins. */
export async function claimJob(requestId) {
  if (hasSupabase) {
    const { data, error } = await supabase.rpc('claim_job', { p_request_id: requestId })
    if (error) throw new Error(extractPgError(error))
    return data
  }

  const me = await auth.current()
  const store0 = readStore()
  const tech0 = store0.technician_profiles.find((t) => t.user_id === me?.profile?.id)
  if (!tech0) throw new Error('NOT_A_TECHNICIAN')

  const gate = demoGate(store0, tech0)
  if (gate.blocked_reason) throw new Error(gate.blocked_reason)

  return mutate((store) => {
    const tech = store.technician_profiles.find((t) => t.id === tech0.id)
    const req = store.service_requests.find((r) => r.id === requestId)
    if (!req) throw new Error('REQUEST_NOT_FOUND')
    if (req.status !== 'open') throw new Error('JOB_NOT_OPEN')
    if (!store.lead_unlocks.some((u) => u.technician_id === tech.id && u.request_id === requestId)) {
      throw new Error('LEAD_NOT_UNLOCKED')
    }
    req.status = 'assigned'
    req.assigned_technician_id = tech.id
    req.assigned_at = new Date().toISOString()
    return demoGate(store, tech)
  })
}

/** "Mark as Finished" — the karigar reports what they actually charged. */
export async function finishJob(requestId, amount) {
  const value = Number(amount)
  if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_AMOUNT')

  if (hasSupabase) {
    const { data, error } = await supabase.rpc('technician_finish_job', {
      p_request_id: requestId,
      p_amount: value,
    })
    if (error) throw new Error(extractPgError(error))
    return data
  }

  const mine = await getMyTechnicianProfile()
  if (!mine) throw new Error('NOT_A_TECHNICIAN')

  return mutate((store) => {
    const req = store.service_requests.find((r) => r.id === requestId)
    if (!req || req.assigned_technician_id !== mine.id || req.status !== 'assigned') {
      throw new Error('JOB_NOT_ASSIGNED_TO_YOU')
    }
    req.status = 'awaiting_confirmation'
    req.technician_amount = value
    req.technician_finished_at = new Date().toISOString()
    return demoGate(store, store.technician_profiles.find((t) => t.id === mine.id))
  })
}

/** Jobs of this customer waiting for their confirmation. */
export async function listJobsAwaitingMe() {
  const me = await auth.current()
  if (!me) return []

  if (hasSupabase) {
    const { data, error } = await supabase
      .from('service_requests')
      .select('*, category:categories(*)')
      .eq('customer_id', me.profile.id)
      .eq('status', 'awaiting_confirmation')
      .order('technician_finished_at', { ascending: true })
    if (error) return []
    const rows = (data || []).map((r) => shapeRequest(r, r.category))
    return attachTechnicianNames(rows)
  }

  const store = readStore()
  return store.service_requests
    .filter((r) => r.customer_id === me.profile.id && r.status === 'awaiting_confirmation')
    .sort((a, b) => new Date(a.technician_finished_at || 0) - new Date(b.technician_finished_at || 0))
    .map((r) => {
      const tech = store.technician_profiles.find((t) => t.id === r.assigned_technician_id)
      const profile = store.profiles.find((p) => p.id === tech?.user_id)
      return {
        ...shapeRequest(r, store.categories.find((c) => c.id === r.category_id)),
        technician_name: tech?.shop_name || profile?.full_name || 'Karigar',
      }
    })
}

async function attachTechnicianNames(rows) {
  const ids = [...new Set(rows.map((r) => r.assigned_technician_id).filter(Boolean))]
  if (ids.length === 0) return rows.map((r) => ({ ...r, technician_name: 'Karigar' }))
  const { data } = await supabase
    .from('technician_profiles')
    .select('id, shop_name, profile:profiles!technician_profiles_user_id_fkey(full_name)')
    .in('id', ids)
  const byId = Object.fromEntries(
    (data || []).map((t) => [t.id, t.shop_name || t.profile?.full_name || 'Karigar']),
  )
  return rows.map((r) => ({ ...r, technician_name: byId[r.assigned_technician_id] || 'Karigar' }))
}

/**
 * The customer's confirmation and the cross-audit.
 *
 * Commission is charged on the higher of the two figures, so under-reporting
 * gains nothing. A gap beyond the tolerance flags a discrepancy and issues a
 * strike.
 */
export async function confirmJob(requestId, amount, rating) {
  const value = Number(amount)
  if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_AMOUNT')

  if (hasSupabase) {
    const { data, error } = await supabase.rpc('customer_confirm_job', {
      p_request_id: requestId,
      p_amount: value,
      p_rating: rating || null,
    })
    if (error) throw new Error(extractPgError(error))
    return data
  }

  const me = await auth.current()
  return mutate((store) => {
    const req = store.service_requests.find((r) => r.id === requestId)
    if (!req || req.customer_id !== me?.profile?.id) throw new Error('JOB_NOT_YOURS')
    if (req.status !== 'awaiting_confirmation') throw new Error('JOB_NOT_AWAITING')

    const cfg = { ...CONFIG_DEFAULTS, ...store.app_config }
    const tech = store.technician_profiles.find((t) => t.id === req.assigned_technician_id)

    const reported = Number(req.technician_amount) || 0
    const basis = Math.max(reported, value)
    const gap = Math.abs(reported - value)
    const tolerance = Number(cfg.discrepancy_tolerance_percent) || 0
    const discrepant = basis > 0 && (gap * 100) / basis > tolerance

    let commission = 0
    const commissionOn = cfg.commission_active === true || cfg.commission_active === 'true'
    if (commissionOn && tech) {
      commission = Math.round((basis * (Number(cfg.commission_percent) || 0)) / 100)
      tech.wallet_balance = Number(tech.wallet_balance) - commission
      store.wallet_transactions.unshift({
        id: newId(),
        technician_id: tech.id,
        amount: -commission,
        kind: 'lead_unlock',
        reference: `commission:${requestId}`,
        balance_after: tech.wallet_balance,
        created_at: new Date().toISOString(),
      })
    }

    req.status = 'completed'
    req.customer_amount = value
    req.customer_confirmed_at = new Date().toISOString()
    req.customer_rating = rating || null
    req.commission_charged = commission
    req.has_discrepancy = discrepant
    req.closed_reason = 'confirmed'

    let strikeLevel = 0
    if (tech) {
      tech.jobs_completed = (Number(tech.jobs_completed) || 0) + 1

      if (rating) {
        const rated = store.service_requests.filter(
          (r) => r.assigned_technician_id === tech.id && r.customer_rating,
        )
        const avg = rated.reduce((n, r) => n + Number(r.customer_rating), 0) / rated.length
        tech.rating = Math.round(avg * 10) / 10
      }

      if (discrepant) {
        strikeLevel = demoIssueStrike(
          store,
          tech.id,
          `Reported ${reported} but customer reported ${value}`,
          requestId,
        )
      }
    }

    return { discrepancy: discrepant, commission, basis, strike_level: strikeLevel }
  })
}

/** Mirrors issue_strike() for the demo backend. */
function demoIssueStrike(store, techId, reason, requestId = null) {
  const cfg = { ...CONFIG_DEFAULTS, ...store.app_config }
  const tech = store.technician_profiles.find((t) => t.id === techId)
  if (!tech) throw new Error('TECHNICIAN_NOT_FOUND')

  const level = (Number(tech.strike_count) || 0) + 1
  let fine = 0
  const now = Date.now()

  if (level === 1) {
    tech.strike_count = 1
    tech.lead_access_frozen_until = new Date(
      now + (Number(cfg.strike1_freeze_hours) || 24) * 3600e3,
    ).toISOString()
  } else if (level === 2) {
    fine = Number(cfg.strike2_fine) || 0
    tech.strike_count = 2
    tech.wallet_balance = Number(tech.wallet_balance) - fine
    tech.lead_access_frozen_until = new Date(
      now + (Number(cfg.strike2_suspend_days) || 7) * 86400e3,
    ).toISOString()
    store.wallet_transactions.unshift({
      id: newId(),
      technician_id: techId,
      amount: -fine,
      kind: 'adjustment',
      reference: 'strike-2-fine',
      balance_after: tech.wallet_balance,
      created_at: new Date().toISOString(),
    })
  } else {
    tech.strike_count = level
    const profile = store.profiles.find((p) => p.id === tech.user_id)
    if (profile) {
      profile.is_banned = true
      profile.banned_reason = `Strike 3 — ${reason}`
      profile.banned_at = new Date().toISOString()
    }
    store.blocked_identities.push({
      id: newId(),
      cnic_number: tech.cnic_number || null,
      phone_number: profile?.phone_number || null,
      reason: `Strike 3 — ${reason}`,
      created_at: new Date().toISOString(),
    })
  }

  store.technician_strikes.unshift({
    id: newId(),
    technician_id: techId,
    request_id: requestId,
    level,
    reason,
    fine_amount: fine,
    is_void: false,
    void_reason: null,
    created_at: new Date().toISOString(),
  })

  return level
}

/** Closes jobs the customer never confirmed, on the karigar's own figure. */
export async function closeStaleConfirmations() {
  if (hasSupabase) {
    const { data, error } = await supabase.rpc('close_stale_confirmations')
    if (error) return 0
    return Number(data) || 0
  }

  return mutate((store) => {
    const cfg = { ...CONFIG_DEFAULTS, ...store.app_config }
    const cutoff = Date.now() - (Number(cfg.confirmation_timeout_days) || 7) * 86400e3
    const commissionOn = cfg.commission_active === true || cfg.commission_active === 'true'
    let n = 0

    for (const req of store.service_requests) {
      if (req.status !== 'awaiting_confirmation') continue
      if (new Date(req.technician_finished_at || 0).getTime() > cutoff) continue

      let commission = 0
      const tech = store.technician_profiles.find((t) => t.id === req.assigned_technician_id)
      if (commissionOn && tech) {
        commission = Math.round(
          ((Number(req.technician_amount) || 0) * (Number(cfg.commission_percent) || 0)) / 100,
        )
        tech.wallet_balance = Number(tech.wallet_balance) - commission
        tech.jobs_completed = (Number(tech.jobs_completed) || 0) + 1
        store.wallet_transactions.unshift({
          id: newId(),
          technician_id: tech.id,
          amount: -commission,
          kind: 'lead_unlock',
          reference: `commission-timeout:${req.id}`,
          balance_after: tech.wallet_balance,
          created_at: new Date().toISOString(),
        })
      }
      req.status = 'completed'
      req.commission_charged = commission
      req.closed_reason = 'auto_timeout'
      n += 1
    }
    return n
  })
}

export async function listMyStrikes() {
  const mine = await getMyTechnicianProfile()
  if (!mine) return []
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('technician_strikes')
      .select('*')
      .eq('technician_id', mine.id)
      .order('created_at', { ascending: false })
    if (error) return []
    return data || []
  }
  return readStore().technician_strikes.filter((s) => s.technician_id === mine.id)
}

/** Postgres surfaces our RAISE EXCEPTION text in `message`. Pull the code. */
function extractPgError(error) {
  const known = [
    'ACCOUNT_BANNED',
    'FROZEN',
    'NEGATIVE_BALANCE',
    'TOO_MANY_UNCONFIRMED',
    'BANNED',
    'LEAD_NOT_UNLOCKED',
    'JOB_NOT_OPEN',
    'JOB_NOT_ASSIGNED_TO_YOU',
    'JOB_NOT_YOURS',
    'JOB_NOT_AWAITING',
    'NOT_A_TECHNICIAN',
    'INVALID_AMOUNT',
    'INSUFFICIENT_BALANCE',
  ]
  const found = known.find((code) => error.message?.includes(code))
  return found || error.message || 'UNKNOWN'
}

/* ═════════════════════════════════════════════════════════════════ admin ══ */

/**
 * Admin operations. Against Supabase every one of these calls an RPC that
 * re-checks `is_admin()` server-side — the route guard in the UI is a
 * convenience, never the security boundary.
 */
export const admin = {
  async overview() {
    if (hasSupabase) {
      const { data, error } = await supabase.rpc('admin_overview')
      if (error) throw error
      return data
    }
    const s = readStore()
    return {
      customers: s.profiles.filter((p) => p.user_role === 'customer').length,
      technicians: s.technician_profiles.length,
      verified: s.technician_profiles.filter((t) => t.is_verified).length,
      banned: s.profiles.filter((p) => p.is_banned).length,
      jobs_open: s.service_requests.filter((r) => r.status === 'open').length,
      jobs_total: s.service_requests.length,
      leads_sold: s.lead_unlocks.length,
      revenue: s.lead_unlocks.reduce((n, u) => n + Number(u.cost_paid || 0), 0),
      wallet_float: s.technician_profiles.reduce((n, t) => n + Number(t.wallet_balance || 0), 0),
    }
  },

  /** Every karigar listing, banned ones included, with their owner's profile. */
  async listTechnicians() {
    if (hasSupabase) {
      const { data, error } = await supabase
        .from('technician_profiles')
        .select('*, profile:profiles!technician_profiles_user_id_fkey(*), category:categories(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((r) => ({
        ...shapeTechnician(r, r.profile, r.category),
        is_banned: Boolean(r.profile?.is_banned),
        banned_reason: r.profile?.banned_reason || null,
      }))
    }
    const store = readStore()
    return store.technician_profiles
      .map((t) => {
        const profile = store.profiles.find((p) => p.id === t.user_id)
        return {
          ...shapeTechnician(t, profile, store.categories.find((c) => c.id === t.category_id)),
          is_banned: Boolean(profile?.is_banned),
          banned_reason: profile?.banned_reason || null,
        }
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  },

  /** Customer and admin accounts, with how many jobs each has posted. */
  async listUsers() {
    if (hasSupabase) {
      const [{ data: profiles, error }, { data: reqs }] = await Promise.all([
        supabase.from('profiles').select('*').neq('user_role', 'technician').order('created_at', { ascending: false }),
        supabase.from('service_requests').select('customer_id'),
      ])
      if (error) throw error
      const counts = {}
      for (const r of reqs || []) counts[r.customer_id] = (counts[r.customer_id] || 0) + 1
      return (profiles || []).map((p) => ({ ...p, job_count: counts[p.id] || 0 }))
    }
    const store = readStore()
    return store.profiles
      .filter((p) => p.user_role !== 'technician')
      .map((p) => ({
        ...p,
        job_count: store.service_requests.filter((r) => r.customer_id === p.id).length,
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  },

  /** Every job in every status, with the poster attached. */
  async listJobs() {
    if (hasSupabase) {
      const { data, error } = await supabase
        .from('service_requests')
        .select('*, category:categories(*), customer:profiles!service_requests_customer_id_fkey(full_name, phone_number, is_banned)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((r) => ({
        ...shapeRequest(r, r.category),
        customer_name: r.customer?.full_name || null,
        customer_phone: r.customer?.phone_number || null,
        customer_banned: Boolean(r.customer?.is_banned),
      }))
    }
    const store = readStore()
    return store.service_requests
      .map((r) => {
        const customer = store.profiles.find((p) => p.id === r.customer_id)
        return {
          ...shapeRequest(r, store.categories.find((c) => c.id === r.category_id)),
          customer_name: customer?.full_name || null,
          customer_phone: customer?.phone_number || null,
          customer_banned: Boolean(customer?.is_banned),
        }
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  },

  async setBan(userId, banned, reason) {
    const me = await auth.current()
    if (me?.profile?.id === userId) throw new Error('CANNOT_BAN_SELF')

    if (hasSupabase) {
      const { error } = await supabase.rpc('admin_set_ban', {
        p_user_id: userId,
        p_banned: banned,
        p_reason: reason || null,
      })
      if (error) throw error
      return
    }
    mutate((store) => {
      const profile = store.profiles.find((p) => p.id === userId)
      if (!profile) throw new Error('USER_NOT_FOUND')
      profile.is_banned = banned
      profile.banned_reason = banned ? reason || null : null
      profile.banned_at = banned ? new Date().toISOString() : null
      if (banned) {
        for (const r of store.service_requests) {
          if (r.customer_id === userId && r.status === 'open') r.status = 'cancelled'
        }
      }
    })
  },

  async setVerified(techId, verified) {
    if (hasSupabase) {
      const { error } = await supabase.rpc('admin_set_verified', {
        p_tech_id: techId,
        p_verified: verified,
      })
      if (error) throw error
      return
    }
    mutate((store) => {
      const row = store.technician_profiles.find((t) => t.id === techId)
      if (row) row.is_verified = verified
    })
  },

  /** Credits a wallet against a JazzCash/EasyPaisa receipt. Negative amounts
   *  are corrections and land in the ledger as an adjustment. */
  async creditWallet(techId, amount, reference) {
    const value = Number(amount)
    if (!value) throw new Error('ZERO_AMOUNT')

    if (hasSupabase) {
      const { data, error } = await supabase.rpc('admin_credit_wallet', {
        p_tech_id: techId,
        p_amount: value,
        p_reference: reference || null,
      })
      if (error) throw error
      return Number(data)
    }
    return mutate((store) => {
      const tech = store.technician_profiles.find((t) => t.id === techId)
      if (!tech) throw new Error('TECHNICIAN_NOT_FOUND')
      tech.wallet_balance = Number(tech.wallet_balance) + value
      store.wallet_transactions.unshift({
        id: newId(),
        technician_id: techId,
        amount: value,
        kind: value > 0 ? 'topup' : 'adjustment',
        reference: reference || 'admin',
        balance_after: tech.wallet_balance,
        created_at: new Date().toISOString(),
      })
      return tech.wallet_balance
    })
  },

  setJobStatus: updateRequestStatus,

  /** Jobs the cross-audit flagged, newest first. */
  async listDiscrepancies() {
    if (hasSupabase) {
      const { data, error } = await supabase
        .from('service_requests')
        .select('*, category:categories(*), customer:profiles!service_requests_customer_id_fkey(full_name)')
        .eq('has_discrepancy', true)
        .order('customer_confirmed_at', { ascending: false })
      if (error) throw error
      return (data || []).map((r) => ({
        ...shapeRequest(r, r.category),
        customer_name: r.customer?.full_name || null,
      }))
    }
    const store = readStore()
    return store.service_requests
      .filter((r) => r.has_discrepancy)
      .sort((a, b) => new Date(b.customer_confirmed_at || 0) - new Date(a.customer_confirmed_at || 0))
      .map((r) => ({
        ...shapeRequest(r, store.categories.find((c) => c.id === r.category_id)),
        customer_name: store.profiles.find((p) => p.id === r.customer_id)?.full_name || null,
      }))
  },

  async listStrikes() {
    if (hasSupabase) {
      const { data, error } = await supabase
        .from('technician_strikes')
        .select('*, technician:technician_profiles(id, shop_name, profile:profiles!technician_profiles_user_id_fkey(full_name))')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((s) => ({
        ...s,
        technician_name:
          s.technician?.shop_name || s.technician?.profile?.full_name || 'Karigar',
      }))
    }
    const store = readStore()
    return store.technician_strikes.map((s) => {
      const tech = store.technician_profiles.find((t) => t.id === s.technician_id)
      const profile = store.profiles.find((p) => p.id === tech?.user_id)
      return {
        ...s,
        technician_name: tech?.shop_name || profile?.full_name || 'Karigar',
      }
    })
  },

  /**
   * Voids a strike and undoes its consequence — refunds the fine, clears the
   * freeze, and un-bans on a voided strike 3. The automatic audit will be
   * wrong sometimes, so this is not optional.
   */
  async voidStrike(strikeId, reason) {
    if (hasSupabase) {
      const { error } = await supabase.rpc('admin_void_strike', {
        p_strike_id: strikeId,
        p_reason: reason || 'Reviewed by admin',
      })
      if (error) throw error
      return
    }
    mutate((store) => {
      const strike = store.technician_strikes.find((s) => s.id === strikeId)
      if (!strike || strike.is_void) return
      const tech = store.technician_profiles.find((t) => t.id === strike.technician_id)
      strike.is_void = true
      strike.void_reason = reason || 'Reviewed by admin'

      if (strike.fine_amount > 0 && tech) {
        tech.wallet_balance = Number(tech.wallet_balance) + Number(strike.fine_amount)
        store.wallet_transactions.unshift({
          id: newId(),
          technician_id: tech.id,
          amount: Number(strike.fine_amount),
          kind: 'adjustment',
          reference: `strike-void:${strikeId}`,
          balance_after: tech.wallet_balance,
          created_at: new Date().toISOString(),
        })
      }

      if (tech) {
        tech.strike_count = store.technician_strikes.filter(
          (s) => s.technician_id === tech.id && !s.is_void,
        ).length
        tech.lead_access_frozen_until = null

        if (strike.level >= 3) {
          const profile = store.profiles.find((p) => p.id === tech.user_id)
          if (profile) {
            profile.is_banned = false
            profile.banned_reason = null
            profile.banned_at = null
          }
          store.blocked_identities = store.blocked_identities.filter(
            (b) =>
              b.phone_number !== profile?.phone_number &&
              (!tech.cnic_number || b.cnic_number !== tech.cnic_number),
          )
        }
      }
    })
  },

  async issueStrike(techId, reason) {
    if (hasSupabase) {
      const { data, error } = await supabase.rpc('admin_issue_strike', {
        p_tech_id: techId,
        p_reason: reason,
      })
      if (error) throw error
      return Number(data)
    }
    return mutate((store) => demoIssueStrike(store, techId, reason))
  },

  /** Recent directory contact reveals, so a disputed charge can be refunded. */
  async listReveals(limit = 60) {
    if (hasSupabase) {
      const { data, error } = await supabase
        .from('contact_reveals')
        .select('*, technician:technician_profiles(id, shop_name), customer:profiles!contact_reveals_customer_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data || []).map((r) => ({
        ...r,
        technician_name: r.technician?.shop_name || 'Karigar',
        customer_name: r.customer?.full_name || 'Customer',
      }))
    }
    const store = readStore()
    return (store.contact_reveals || []).slice(0, limit).map((r) => {
      const tech = store.technician_profiles.find((t) => t.id === r.technician_id)
      return {
        ...r,
        technician_name: tech?.shop_name || 'Karigar',
        customer_name: store.profiles.find((p) => p.id === r.customer_id)?.full_name || 'Customer',
      }
    })
  },

  async refundReveal(revealId, reason) {
    if (hasSupabase) {
      const { error } = await supabase.rpc('admin_refund_reveal', {
        p_reveal_id: revealId,
        p_reason: reason || 'Admin refund',
      })
      if (error) throw error
      return
    }
    mutate((store) => {
      const row = (store.contact_reveals || []).find((r) => r.id === revealId)
      if (!row || row.refunded) return
      row.refunded = true
      row.refund_reason = reason || 'Admin refund'
      if (row.cost_paid > 0) {
        const tech = store.technician_profiles.find((t) => t.id === row.technician_id)
        if (tech) {
          tech.wallet_balance = Number(tech.wallet_balance) + Number(row.cost_paid)
          store.wallet_transactions.unshift({
            id: newId(),
            technician_id: tech.id,
            amount: Number(row.cost_paid),
            kind: 'adjustment',
            reference: `reveal-refund:${revealId}`,
            balance_after: tech.wallet_balance,
            created_at: new Date().toISOString(),
          })
        }
      }
    })
  },

  closeStale: closeStaleConfirmations,
}

/**
 * Demo-only wallet credit, so the monetization flow can be walked through
 * end to end without a payment integration. In production a JazzCash /
 * EasyPaisa webhook writes this row server-side; there is deliberately no
 * client path to credit a wallet against Supabase.
 */
export async function creditWalletDemo(amount, reference = 'demo-topup') {
  if (hasSupabase) throw new Error('TOPUP_IS_SERVER_SIDE')
  const mine = await getMyTechnicianProfile()
  if (!mine) throw new Error('NOT_A_TECHNICIAN')
  return mutate((store) => {
    const tech = store.technician_profiles.find((t) => t.id === mine.id)
    tech.wallet_balance = Number(tech.wallet_balance) + Number(amount)
    store.wallet_transactions.unshift({
      id: newId(),
      technician_id: tech.id,
      amount: Number(amount),
      kind: 'topup',
      reference,
      balance_after: tech.wallet_balance,
      created_at: new Date().toISOString(),
    })
    return tech.wallet_balance
  })
}

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

/** True when the app is wired to a real Supabase project. When false the
 *  whole app runs on the demo backend in `db.js` — no config, no network. */
export const hasSupabase = Boolean(url && anonKey)

export const supabase = hasSupabase
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null

export const authMode = (import.meta.env.VITE_AUTH_MODE || 'local').trim()

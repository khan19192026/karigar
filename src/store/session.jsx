import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { auth, getConfig, getMyTechnicianProfile } from '../lib/db'
import { CONFIG_DEFAULTS } from '../lib/constants'

const SessionContext = createContext(null)

/**
 * Holds the three things nearly every screen needs: who is signed in, their
 * karigar listing if they have one, and the remote config that decides
 * whether leads cost money.
 */
export function SessionProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [techProfile, setTechProfile] = useState(null)
  const [config, setConfig] = useState(CONFIG_DEFAULTS)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [session, cfg] = await Promise.all([auth.current(), getConfig()])
    setProfile(session?.profile || null)
    setConfig(cfg)
    setTechProfile(session?.profile ? await getMyTechnicianProfile() : null)
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await refresh()
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [refresh])

  const signOut = useCallback(async () => {
    await auth.signOut()
    setProfile(null)
    setTechProfile(null)
  }, [])

  const value = useMemo(() => {
    // Config values arrive as JSONB, so a boolean can show up as the string
    // "true". Coerce once, here, rather than at every call site.
    const monetization =
      config.monetization_active === true || config.monetization_active === 'true'
    return {
      profile,
      techProfile,
      config,
      loading,
      refresh,
      signOut,
      isTechnician: profile?.user_role === 'technician',
      // A banned admin loses the panel — matches the is_admin() SQL function.
      isAdmin: profile?.user_role === 'admin' && !profile?.is_banned,
      isBanned: Boolean(profile?.is_banned),
      monetizationActive: monetization,
      leadCost: Number(config.lead_unlock_cost) || 0,
      freeLeadsAllowance: Number(config.free_leads_allowance) || 0,
      supportWhatsapp: String(config.support_whatsapp || '').replace(/"/g, ''),
    }
  }, [profile, techProfile, config, loading, refresh, signOut])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}

import { useEffect, useState } from 'react'
import { isLocalRef, resolveMediaUrl } from '../../lib/blobStore'

/**
 * Resolves a stored media reference into something a tag can render.
 *
 * Supabase URLs pass straight through. Demo `idb:` references become object
 * URLs, which this revokes on unmount — an object URL held forever pins its
 * blob in memory, and chat media is exactly the wrong thing to leak.
 */
export default function useMediaUrl(ref) {
  const [url, setUrl] = useState(() => (isLocalRef(ref) ? null : ref || null))

  useEffect(() => {
    if (!ref) {
      setUrl(null)
      return
    }
    if (!isLocalRef(ref)) {
      setUrl(ref)
      return
    }

    let created = null
    let alive = true

    resolveMediaUrl(ref).then((resolved) => {
      if (!alive) {
        if (resolved) URL.revokeObjectURL(resolved)
        return
      }
      created = resolved
      setUrl(resolved)
    })

    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [ref])

  return url
}

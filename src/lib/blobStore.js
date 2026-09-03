/**
 * IndexedDB blob store for the demo backend.
 *
 * Chat media cannot live in localStorage: a single 8 MB video becomes ~11 MB
 * once base64-encoded, which blows the whole 5 MB quota on its own.
 * IndexedDB stores Blobs natively with no encoding overhead and a far larger
 * budget, so the demo can actually carry photos and video.
 *
 * Stored references look like `idb:<id>`; call resolveMediaUrl() to turn one
 * into something an <img> or <video> can use.
 */

const DB_NAME = 'karigar-media'
const STORE = 'blobs'
const VERSION = 1

let dbPromise = null

function open() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const store = transaction.objectStore(STORE)
        const request = fn(store)
        transaction.oncomplete = () => resolve(request?.result)
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      }),
  )
}

const newKey = () =>
  crypto.randomUUID ? crypto.randomUUID() : `m-${Math.random().toString(36).slice(2)}`

/** Stores a blob and returns its `idb:<id>` reference. */
export async function putBlob(blob) {
  const key = newKey()
  await tx('readwrite', (store) => store.put(blob, key))
  return `idb:${key}`
}

export async function getBlob(ref) {
  if (!ref?.startsWith('idb:')) return null
  try {
    return (await tx('readonly', (store) => store.get(ref.slice(4)))) || null
  } catch {
    return null
  }
}

/**
 * Turns a stored reference into a usable URL.
 *
 * The caller owns the returned object URL and must revoke it — see
 * useMediaUrl(), which does that on unmount.
 */
export async function resolveMediaUrl(ref) {
  if (!ref) return null
  if (!ref.startsWith('idb:')) return ref
  const blob = await getBlob(ref)
  return blob ? URL.createObjectURL(blob) : null
}

export function isLocalRef(ref) {
  return Boolean(ref?.startsWith('idb:'))
}

/** Wipes stored media. Used by "Reset demo data". */
export async function clearBlobs() {
  try {
    await tx('readwrite', (store) => store.clear())
  } catch {
    /* nothing to clear */
  }
}

/**
 * ULTIMATE PERSISTENT FINGERPRINTING SYSTEM v3.0
 * 
 * Multi-layer fingerprinting that survives:
 * - Cookie clearing
 * - LocalStorage clearing
 * - SessionStorage clearing
 * - IndexedDB clearing
 * - Cache clearing
 * - Incognito mode (partially)
 * 
 * Uses multiple storage mechanisms + hardware fingerprint consensus
 * for maximum persistence and accuracy without false positives.
 */

import { generateDeviceFingerprint } from "./client-fingerprint"

// Storage keys with obfuscated names to avoid detection
const STORAGE_KEYS = {
  localStorage: "_v_fp_h",
  sessionStorage: "_s_fp_h",
  indexedDB: "v0_device_data",
  cookie: "_d_id",
  cacheAPI: "device-identity",
}

// IndexedDB database name
const DB_NAME = "v0_security_store"
const DB_VERSION = 1
const STORE_NAME = "fingerprints"

/**
 * Races a promise against a timeout, resolving to `fallback` if the
 * promise hasn't settled in time.
 *
 * Why this exists: `indexedDB.open()`'s request never fires `onsuccess` or
 * `onerror` if it's `onblocked` (another tab holds an older DB version
 * open) — and in some browsers/modes (Safari private browsing, some
 * locked-down enterprise policies, storage-partitioning edge cases)
 * IndexedDB requests can simply never settle at all. Every caller of
 * `getIndexedDBFingerprint` / `setIndexedDBFingerprint` sits in the
 * `generatePersistentFingerprint()` chain that `AuthSecurityGuard` awaits
 * before it will render the login/signup form — so a stuck IndexedDB
 * request didn't just fail silently, it left the visitor stuck on
 * "Verifying your connection..." forever with no way to sign in. This was
 * the root cause of the sign-in timeout: nothing in the chain had a
 * ceiling on how long it could take.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve(fallback)
      }
    }, ms)
    promise.then(
      (value) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(value)
        }
      },
      () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(fallback)
        }
      },
    )
  })
}

interface StoredFingerprint {
  hash: string
  createdAt: number
  lastSeenAt: number
  confidence: number
  storageMethod: string
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE LAYER 1: INDEXEDDB (survives most clearing)
// ═══════════════════════════════════════════════════════════════════════════
async function getIndexedDBFingerprint(): Promise<StoredFingerprint | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => resolve(null)
      // Fires when another tab has an older-version connection open and
      // never releases it — without this handler the request just sits
      // forever (no onsuccess, no onerror). Fail open instead of hanging.
      request.onblocked = () => resolve(null)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" })
        }
      }
      
      request.onsuccess = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result
          const transaction = db.transaction([STORE_NAME], "readonly")
          const store = transaction.objectStore(STORE_NAME)
          const getRequest = store.get("primary")
          
          getRequest.onsuccess = () => {
            const data = getRequest.result
            if (data?.fingerprint) {
              resolve({
                hash: data.fingerprint,
                createdAt: data.createdAt || Date.now(),
                lastSeenAt: data.lastSeenAt || Date.now(),
                confidence: 95,
                storageMethod: "indexedDB",
              })
            } else {
              resolve(null)
            }
          }
          
          getRequest.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }
    } catch {
      resolve(null)
    }
  })
}

async function setIndexedDBFingerprint(hash: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      // Same "another tab is blocking the version upgrade" case as
      // getIndexedDBFingerprint above — resolve instead of hanging.
      request.onblocked = () => resolve()

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" })
        }
      }
      
      request.onsuccess = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result
          const transaction = db.transaction([STORE_NAME], "readwrite")
          const store = transaction.objectStore(STORE_NAME)
          
          store.put({
            id: "primary",
            fingerprint: hash,
            createdAt: Date.now(),
            lastSeenAt: Date.now(),
          })
          
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => resolve()
        } catch {
          resolve()
        }
      }
      
      request.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE LAYER 2: CACHE API (often survives clearing)
// ═══════════════════════════════════════════════════════════════════════════
async function getCacheAPIFingerprint(): Promise<StoredFingerprint | null> {
  try {
    if (!("caches" in window)) return null
    
    const cache = await caches.open(STORAGE_KEYS.cacheAPI)
    const response = await cache.match("/device-identity")
    
    if (response) {
      const data = await response.json()
      if (data?.fingerprint) {
        return {
          hash: data.fingerprint,
          createdAt: data.createdAt || Date.now(),
          lastSeenAt: data.lastSeenAt || Date.now(),
          confidence: 85,
          storageMethod: "cacheAPI",
        }
      }
    }
    return null
  } catch {
    return null
  }
}

async function setCacheAPIFingerprint(hash: string): Promise<void> {
  try {
    if (!("caches" in window)) return
    
    const cache = await caches.open(STORAGE_KEYS.cacheAPI)
    const data = {
      fingerprint: hash,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    }
    
    await cache.put(
      "/device-identity",
      new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      })
    )
  } catch {
    // Silent fail
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE LAYER 3: LOCALSTORAGE (basic persistence)
// ═══════════════════════════════════════════════════════════════════════════
function getLocalStorageFingerprint(): StoredFingerprint | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.localStorage)
    if (data) {
      const parsed = JSON.parse(atob(data))
      if (parsed?.h) {
        return {
          hash: parsed.h,
          createdAt: parsed.c || Date.now(),
          lastSeenAt: parsed.l || Date.now(),
          confidence: 70,
          storageMethod: "localStorage",
        }
      }
    }
    return null
  } catch {
    return null
  }
}

function setLocalStorageFingerprint(hash: string): void {
  try {
    const data = {
      h: hash,
      c: Date.now(),
      l: Date.now(),
    }
    localStorage.setItem(STORAGE_KEYS.localStorage, btoa(JSON.stringify(data)))
  } catch {
    // Silent fail
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE LAYER 4: SESSION STORAGE (session persistence)
// ═══════════════════════════════════════════════════════════════════════════
function getSessionStorageFingerprint(): StoredFingerprint | null {
  try {
    const data = sessionStorage.getItem(STORAGE_KEYS.sessionStorage)
    if (data) {
      const parsed = JSON.parse(atob(data))
      if (parsed?.h) {
        return {
          hash: parsed.h,
          createdAt: parsed.c || Date.now(),
          lastSeenAt: parsed.l || Date.now(),
          confidence: 60,
          storageMethod: "sessionStorage",
        }
      }
    }
    return null
  } catch {
    return null
  }
}

function setSessionStorageFingerprint(hash: string): void {
  try {
    const data = {
      h: hash,
      c: Date.now(),
      l: Date.now(),
    }
    sessionStorage.setItem(STORAGE_KEYS.sessionStorage, btoa(JSON.stringify(data)))
  } catch {
    // Silent fail
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE LAYER 5: COOKIE (http cookie persistence)
// ═══════════════════════════════════════════════════════════════════════════
function getCookieFingerprint(): StoredFingerprint | null {
  try {
    const cookies = document.cookie.split(";")
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=")
      if (name === STORAGE_KEYS.cookie && value) {
        const decoded = atob(decodeURIComponent(value))
        const parsed = JSON.parse(decoded)
        if (parsed?.h) {
          return {
            hash: parsed.h,
            createdAt: parsed.c || Date.now(),
            lastSeenAt: parsed.l || Date.now(),
            confidence: 75,
            storageMethod: "cookie",
          }
        }
      }
    }
    return null
  } catch {
    return null
  }
}

function setCookieFingerprint(hash: string): void {
  try {
    const data = {
      h: hash,
      c: Date.now(),
      l: Date.now(),
    }
    const encoded = encodeURIComponent(btoa(JSON.stringify(data)))
    // Set cookie with 10 year expiry
    const expires = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toUTCString()
    document.cookie = `${STORAGE_KEYS.cookie}=${encoded}; expires=${expires}; path=/; SameSite=Strict; Secure`
  } catch {
    // Silent fail
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: PERSISTENT FINGERPRINT GENERATION WITH CONSENSUS
// ═══════════════════════════════════════════════════════════════════════════
export interface PersistentFingerprintResult {
  fingerprint: string
  isPersisted: boolean
  isNewDevice: boolean
  storageMethodsUsed: string[]
  confidence: number
  createdAt: number
  hardwareFingerprint: string
  signals: {
    indexedDB: boolean
    cacheAPI: boolean
    localStorage: boolean
    sessionStorage: boolean
    cookie: boolean
    hardwareMatch: boolean
  }
}

/**
 * Compute the persistent fingerprint. Prefer generatePersistentFingerprint(),
 * which memoizes this per page load.
 */
async function computePersistentFingerprint(): Promise<PersistentFingerprintResult> {
  // PERF (T3): every read below is INDEPENDENT, but they used to be awaited one
  // after another — hardware, then IndexedDB (1.5s ceiling), then Cache API
  // (1.5s ceiling), then three synchronous reads. On a cold profile that is up
  // to ~3s of pure serial waiting on the login critical path, for no reason:
  // none of these inputs feeds another. Running them together makes the cost
  // max(individual) instead of sum(individual).
  const [
    hardwareFingerprint,
    indexedDBFp,
    cacheFp,
    localFp,
    sessionFp,
    cookieFp,
  ] = await Promise.all([
    generateDeviceFingerprint(),
    // 1.5s ceiling each. onblocked/onerror already resolve on their own; this is
    // the backstop for the rarer "request never fires any event at all" case
    // (see withTimeout's doc comment above).
    withTimeout(getIndexedDBFingerprint(), 1500, null),
    withTimeout(getCacheAPIFingerprint(), 1500, null),
    Promise.resolve(getLocalStorageFingerprint()),
    Promise.resolve(getSessionStorageFingerprint()),
    Promise.resolve(getCookieFingerprint()),
  ])

  // Step 2: Collect whatever the storage layers returned, in priority order.
  const storedFingerprints: StoredFingerprint[] = []
  if (indexedDBFp) storedFingerprints.push(indexedDBFp)
  if (cacheFp) storedFingerprints.push(cacheFp)
  if (localFp) storedFingerprints.push(localFp)
  if (sessionFp) storedFingerprints.push(sessionFp)
  if (cookieFp) storedFingerprints.push(cookieFp)

  // Step 3: Determine the canonical fingerprint using consensus
  let canonicalFingerprint: string
  let isPersisted = false
  let isNewDevice = true
  let createdAt = Date.now()
  
  if (storedFingerprints.length > 0) {
    // Use the most confident stored fingerprint
    const sorted = storedFingerprints.sort((a, b) => b.confidence - a.confidence)
    
    // Check if stored fingerprint matches hardware fingerprint
    const matchesHardware = sorted.some(fp => fp.hash === hardwareFingerprint)
    
    if (matchesHardware) {
      // Perfect match - use hardware fingerprint
      canonicalFingerprint = hardwareFingerprint
      isPersisted = true
      isNewDevice = false
      createdAt = sorted.find(fp => fp.hash === hardwareFingerprint)?.createdAt || Date.now()
    } else {
      // Stored fingerprints don't match hardware - possible data clearing or new browser
      // Use the most common stored fingerprint if multiple agree
      const fingerPrintCounts = new Map<string, number>()
      for (const fp of storedFingerprints) {
        fingerPrintCounts.set(fp.hash, (fingerPrintCounts.get(fp.hash) || 0) + 1)
      }
      
      // Find most common
      let maxCount = 0
      let mostCommon = sorted[0].hash
      for (const [hash, count] of fingerPrintCounts) {
        if (count > maxCount) {
          maxCount = count
          mostCommon = hash
        }
      }
      
      // If at least 2 storage methods agree, use that fingerprint
      // This helps survive hardware fingerprint changes (browser updates, etc.)
      if (maxCount >= 2) {
        canonicalFingerprint = mostCommon
        isPersisted = true
        isNewDevice = false
        createdAt = sorted.find(fp => fp.hash === mostCommon)?.createdAt || Date.now()
      } else {
        // No consensus - use hardware fingerprint but flag as potentially new device
        canonicalFingerprint = hardwareFingerprint
        isPersisted = false
        isNewDevice = true
      }
    }
  } else {
    // No stored fingerprints - this is a new device
    canonicalFingerprint = hardwareFingerprint
    isPersisted = false
    isNewDevice = true
  }
  
  // Step 4: Persist the fingerprint to every available storage layer.
  //
  // PERF (T3): these writes are FIRE-AND-FORGET. The caller only needs the
  // fingerprint VALUE; whether it has finished being mirrored into IndexedDB and
  // the Cache API is irrelevant to this request and cost up to 3s of blocking
  // time on the login path. The synchronous writes stay inline (they are free);
  // the two async ones are kicked off and not awaited.
  const storageMethodsUsed: string[] = []

  void Promise.allSettled([
    withTimeout(setIndexedDBFingerprint(canonicalFingerprint), 1500, undefined),
    withTimeout(setCacheAPIFingerprint(canonicalFingerprint), 1500, undefined),
  ])
  storageMethodsUsed.push("indexedDB", "cacheAPI")

  setLocalStorageFingerprint(canonicalFingerprint)
  storageMethodsUsed.push("localStorage")

  setSessionStorageFingerprint(canonicalFingerprint)
  storageMethodsUsed.push("sessionStorage")

  setCookieFingerprint(canonicalFingerprint)
  storageMethodsUsed.push("cookie")
  
  // Calculate overall confidence
  const confidence = isPersisted
    ? Math.max(...storedFingerprints.map(fp => fp.confidence))
    : 50 // New device has lower confidence
  
  return {
    fingerprint: canonicalFingerprint,
    isPersisted,
    isNewDevice,
    storageMethodsUsed,
    confidence,
    createdAt,
    hardwareFingerprint,
    signals: {
      indexedDB: !!indexedDBFp,
      cacheAPI: !!cacheFp,
      localStorage: !!localFp,
      sessionStorage: !!sessionFp,
      cookie: !!cookieFp,
      hardwareMatch: storedFingerprints.some(fp => fp.hash === hardwareFingerprint),
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PER-PAGE MEMOIZATION
//
// PERF (T3/T4): the fingerprint is deterministic for a given page load, but it
// was computed independently by BOTH the login page (its own useEffect) and
// AuthSecurityGuard — and, before the T1 fix, twice more because the guard's
// effect re-fired. That is up to four full passes over IndexedDB, the Cache API,
// canvas/WebGL hardware probing and cookie storage per sign-in.
//
// A module-level memo makes every call after the first free, and de-duplicates
// concurrent callers onto a single in-flight computation so simultaneous mounts
// cannot race.
// ═══════════════════════════════════════════════════════════════════════════

let cachedResult: PersistentFingerprintResult | null = null
let inFlight: Promise<PersistentFingerprintResult> | null = null

export function generatePersistentFingerprint(): Promise<PersistentFingerprintResult> {
  if (cachedResult) return Promise.resolve(cachedResult)
  if (inFlight) return inFlight

  inFlight = computePersistentFingerprint()
    .then((result) => {
      cachedResult = result
      return result
    })
    .finally(() => {
      // Clear the in-flight handle either way: on success `cachedResult` now
      // serves subsequent callers, and on failure the next caller should be able
      // to retry rather than being stuck with a rejected promise forever.
      inFlight = null
    })

  return inFlight
}

/**
 * Drop the memoized fingerprint. Intended for tests and for the explicit
 * "re-check connection" retry path, where the user is asking for fresh work.
 */
export function resetPersistentFingerprintCache(): void {
  cachedResult = null
  inFlight = null
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVER-SIDE VERIFICATION HELPER
// ═══════════════════════════════════════════════════════════════════════════
export interface MultiAccountCheckResult {
  isAllowed: boolean
  existingAccounts: number
  isFlagged: boolean
  flagReason?: string
  confidence: number
}

/**
 * Check if this fingerprint is associated with too many accounts.
 * Call this from auth pages before allowing signup/signin.
 */
export async function checkMultiAccountServer(
  fingerprint: string,
  currentUserId?: string
): Promise<MultiAccountCheckResult> {
  try {
    const response = await fetch("/api/security/multi-account-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fingerprint,
        currentUserId,
        timestamp: Date.now(),
      }),
    })
    
    if (!response.ok) {
      // On error, allow but with low confidence
      return {
        isAllowed: true,
        existingAccounts: 0,
        isFlagged: false,
        confidence: 0,
      }
    }
    
    return response.json()
  } catch {
    // On network error, allow but flag for review
    return {
      isAllowed: true,
      existingAccounts: 0,
      isFlagged: false,
      confidence: 0,
    }
  }
}

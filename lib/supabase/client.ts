import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr"

type SupabaseClient = ReturnType<typeof createSupabaseBrowserClient>

// Use globalThis for singleton pattern that works with HMR
const globalForSupabase = globalThis as unknown as {
  supabaseBrowserClient: SupabaseClient | undefined
  supabaseInitError: boolean | undefined
}

function getClient(): SupabaseClient {
  // Return cached client if available
  if (globalForSupabase.supabaseBrowserClient) {
    return globalForSupabase.supabaseBrowserClient
  }

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    globalForSupabase.supabaseInitError = true
    // Fail fast with a diagnosable message instead of returning null and
    // crashing later with an opaque null-dereference at some call site.
    throw new Error(
      "[Supabase Client] Missing NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    )
  }

  // Use default storage (localStorage) - it's the standard for browser clients
  // The server handles cookie-based auth, and the browser client syncs via onAuthStateChange
  globalForSupabase.supabaseBrowserClient = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey)
  return globalForSupabase.supabaseBrowserClient
}

export function createClient(): SupabaseClient {
  return getClient()
}

export function createBrowserClient(): SupabaseClient {
  return getClient()
}

// Helper to check if Supabase is properly configured
export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

// Reset client state (useful for testing or after configuration changes)
export function resetSupabaseClient(): void {
  globalForSupabase.supabaseBrowserClient = undefined
  globalForSupabase.supabaseInitError = undefined
}

/**
 * ROOT CAUSE FIX — Supabase Web Lock orphan bug (supabase-js issue #2111)
 *
 * @supabase/ssr uses the browser Web Locks API (navigator.locks) to serialise
 * auth operations. When React Strict Mode double-mounts a component, or the
 * user navigates away mid-request, the component unmounts and the AbortController
 * fires — but the lock is never released. Every subsequent getUser() / getSession()
 * call queues behind the orphaned lock and hangs forever.
 *
 * IMPORTANT: We steal the lock when there is AT LEAST ONE pending request waiting
 * behind a held lock. A held lock with ZERO pending requests is normal (active
 * auth operation in flight). A held lock with >= 1 pending is already a blockage —
 * the previous threshold of >= 2 was too conservative and left single-caller
 * scenarios (the common real-world case) hanging forever.
 */
function getAuthLockName(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  try {
    // Lock name format used by @supabase/gotrue-js:
    //   "lock:sb-<projectRef>-auth-token"
    const projectRef = new URL(url).hostname.split(".")[0]
    return `lock:sb-${projectRef}-auth-token`
  } catch {
    return null
  }
}

// Track when we last stole a lock to avoid doing it too frequently
let lastLockStealTime = 0
const LOCK_STEAL_COOLDOWN = 10000 // 10 seconds cooldown between steals

export async function clearOrphanedAuthLock(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.locks?.query) return
  const lockName = getAuthLockName()
  if (!lockName) return

  try {
    const state = await navigator.locks.query()
    const held = state.held ?? []
    const pending = state.pending ?? []

    // Count how many requests are waiting for this lock
    const pendingCount = pending.filter((l) => l.name === lockName).length
    const isHeld = held.some((l) => l.name === lockName)

    // Only consider it orphaned if:
    // 1. The lock IS held
    // 2. At least 1 request is pending (any waiter behind a held lock = blockage)
    // 3. We haven't stolen recently (cooldown to prevent rapid stealing)
    const now = Date.now()
    const isOrphaned = isHeld && pendingCount >= 1 && (now - lastLockStealTime) > LOCK_STEAL_COOLDOWN

    if (!isOrphaned) return

    console.warn(`[Supabase] Orphaned auth Web Lock detected (${pendingCount} pending) — stealing to unblock auth calls`)
    lastLockStealTime = now

    // Steal the lock; the callback returns immediately, releasing it.
    await new Promise<void>((resolve) => {
      navigator.locks.request(lockName, { steal: true }, () => {
        resolve()
        // Returning undefined releases the lock immediately.
      })
    })
  } catch {
    // Best-effort: if the Web Locks API isn't available or throws, carry on.
  }
}

/**
 * Get the current auth user safely.
 *
 * The previous implementation called clearOrphanedAuthLock() BEFORE invoking
 * getUser(). At that point the Web Locks pending queue for this tab is still
 * empty (pendingCount = 0), so the orphan check never triggers even when a
 * stale lock is held. getUser() then queues itself (pendingCount becomes 1)
 * and hangs forever because no subsequent check ever runs.
 *
 * FIX: after kicking off getUser() (so our request is now in the pending
 * queue), we schedule a second clearOrphanedAuthLock() call 500 ms later.
 * By then pendingCount >= 1, the orphan IS detected, the lock is stolen,
 * and the queued getUser() unblocks. The timer is cancelled immediately if
 * getUser() resolves normally (healthy case has zero overhead).
 */
/**
 * getAuthUser — server-first auth with client fallback.
 *
 * Strategy (in order):
 *  1. Hit /api/auth/me — runs on the server, reads the httpOnly session cookie
 *     directly via @supabase/ssr. Always reliable, no Web Lock dependency.
 *  2. If the API call fails, fall back to the browser client with orphaned-lock
 *     mitigation and a hard 4-second timeout.
 *  3. Last resort: getSession() reads from localStorage — no network, no locks.
 */
export async function getAuthUser() {
  // ── STEP 1: Server-side auth (most reliable) ──────────────────────────────
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.user) return data.user
    }
  } catch {
    // Network error or timeout — fall through to client-side
  }

  // ── STEP 2: Client-side getUser() with lock mitigation ───────────────────
  const supabase = getClient()
  if (!supabase) return null

  try {
    await clearOrphanedAuthLock()
    const getUserPromise = supabase.auth.getUser()
    const retryTimer = setTimeout(clearOrphanedAuthLock, 500)
    const result = await Promise.race([
      getUserPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("getUser timeout")), 4000)
      ),
    ])
    clearTimeout(retryTimer)
    const user = (result as any)?.data?.user ?? null
    if (user) return user
  } catch {
    // Timed out or lock error — fall through to session fallback
  }

  // ── STEP 3: Last resort — read session from localStorage (no network) ─────
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user ?? null
  } catch {
    return null
  }
}
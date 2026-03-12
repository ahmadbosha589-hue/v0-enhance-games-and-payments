import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr"

type SupabaseClient = ReturnType<typeof createSupabaseBrowserClient>

// Use globalThis for singleton pattern that works with HMR
const globalForSupabase = globalThis as unknown as {
  supabaseBrowserClient: SupabaseClient | undefined
  supabaseInitError: boolean | undefined
}

function getClient(): SupabaseClient | null {
  // If we already failed to initialize, return null immediately
  if (globalForSupabase.supabaseInitError) {
    return null
  }

  // Return cached client if available
  if (globalForSupabase.supabaseBrowserClient) {
    return globalForSupabase.supabaseBrowserClient
  }

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    globalForSupabase.supabaseInitError = true
    return null
  }

  try {
    // Configure browser client with cookie-based storage to match the server
    // This ensures the session is shared between server and client
    globalForSupabase.supabaseBrowserClient = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        // Read cookies from document.cookie
        getAll() {
          if (typeof document === "undefined") return []
          return document.cookie.split("; ").filter(Boolean).map((cookie) => {
            const [name, ...rest] = cookie.split("=")
            return { name, value: rest.join("=") }
          })
        },
        // Write cookies to document.cookie
        setAll(cookiesToSet) {
          if (typeof document === "undefined") return
          cookiesToSet.forEach(({ name, value, options }) => {
            let cookieString = `${name}=${value}`
            if (options?.path) cookieString += `; path=${options.path}`
            if (options?.maxAge) cookieString += `; max-age=${options.maxAge}`
            if (options?.domain) cookieString += `; domain=${options.domain}`
            if (options?.sameSite) cookieString += `; samesite=${options.sameSite}`
            if (options?.secure) cookieString += `; secure`
            document.cookie = cookieString
          })
        },
      },
    })
    return globalForSupabase.supabaseBrowserClient
  } catch (err) {
    console.error("[Supabase Client] Failed to create client:", err)
    globalForSupabase.supabaseInitError = true
    return null
  }
}

export function createClient(): SupabaseClient | null {
  return getClient()
}

export function createBrowserClient(): SupabaseClient | null {
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
 * IMPORTANT: We only steal the lock when there are PENDING requests waiting.
 * A held lock with no pending requests is NORMAL during active auth operations.
 * Only when requests are queued up and waiting does it indicate an orphan.
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
    // 2. There are 2+ pending requests waiting (indicates real blockage, not just normal operation)
    // 3. We haven't stolen recently (cooldown to prevent rapid stealing)
    const now = Date.now()
    const isOrphaned = isHeld && pendingCount >= 2 && (now - lastLockStealTime) > LOCK_STEAL_COOLDOWN

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
 * Clears any orphaned Web Lock first so auth calls never hang.
 */
export async function getAuthUser() {
  const supabase = getClient()
  if (!supabase) return null

  // Clear any stale Web Lock before touching auth (fixes the hang-forever bug).
  await clearOrphanedAuthLock()

  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}

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
    globalForSupabase.supabaseBrowserClient = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey)
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
 * Fix: before any auth call, detect a held lock with no corresponding pending
 * request and forcibly steal it with { steal: true }, releasing it immediately.
 * This is safe because stealing only kicks out callers that are already stuck.
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

export async function clearOrphanedAuthLock(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.locks?.query) return
  const lockName = getAuthLockName()
  if (!lockName) return

  try {
    const state = await navigator.locks.query()
    const held = state.held ?? []
    const pending = state.pending ?? []

    // Only steal when the lock IS held but nobody legitimate is waiting for it.
    // If pending > 0 those are live callers — don't disrupt them.
    const isOrphaned =
      held.some((l) => l.name === lockName) && pending.filter((l) => l.name === lockName).length === 0

    if (!isOrphaned) return

    console.warn("[Supabase] Orphaned auth Web Lock detected — stealing to unblock auth calls")

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
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
 * Get the current auth user without ever hanging forever.
 *
 * Strategy:
 *  1. getSession() — reads from localStorage, resolves instantly, no network.
 *  2. getUser()    — verifies the JWT server-side (background, 6 s timeout).
 *                    Falls back to the session user on timeout/error so the
 *                    caller always gets a result quickly.
 *
 * Returns null only when there is genuinely no local session.
 */
export async function getAuthUser() {
  const supabase = getClient()
  if (!supabase) return null

  // Instant local read — never hangs
  const { data: { session } } = await supabase.auth.getSession()
  const sessionUser = session?.user ?? null
  if (!sessionUser) return null

  // Background server verification with a hard timeout
  try {
    const raced = await Promise.race([
      supabase.auth.getUser(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ])
    if (raced && (raced as any).data?.user) {
      return (raced as any).data.user
    }
  } catch {
    // Verification failed — fall through to session user
  }

  return sessionUser
}
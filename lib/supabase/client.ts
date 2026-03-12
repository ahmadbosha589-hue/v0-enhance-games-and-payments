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

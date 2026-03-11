import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr"

const globalForSupabase = globalThis as unknown as {
  supabaseBrowserClient: ReturnType<typeof createSupabaseBrowserClient> | undefined
}

function getClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[Supabase Client] Environment variables not configured:", {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
    })
    return null
  }

  if (globalForSupabase.supabaseBrowserClient) {
    return globalForSupabase.supabaseBrowserClient
  }

  try {
    globalForSupabase.supabaseBrowserClient = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey)
  } catch (err) {
    console.error("[Supabase Client] Failed to create client:", err)
    return null
  }

  return globalForSupabase.supabaseBrowserClient
}

export function createClient() {
  return getClient()
}

export function createBrowserClient() {
  return getClient()
}

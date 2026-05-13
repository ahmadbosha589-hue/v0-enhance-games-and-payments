import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { cache } from "react"

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[Supabase Server] Environment variables not configured")
    return null
  }

  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // The "setAll" method was called from a Server Component.
        }
      },
    },
  })
}

// Memoize the admin client per-request — avoids re-creating it on every
// safeQuery / getProfile call within the same RSC tree.
export const createAdminClient = cache(function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    console.warn("[Supabase Admin] NEXT_PUBLIC_SUPABASE_URL not configured")
    return null
  }

  const keyToUse = serviceRoleKey || anonKey
  if (!keyToUse) {
    console.warn("[Supabase Admin] No API key configured")
    return null
  }

  return createSupabaseClient(supabaseUrl, keyToUse, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
})

/**
 * Detect whether the current request carries a Supabase session cookie.
 * Used as a "soft" auth signal for resilience: if getUser() times out due
 * to a slow Supabase Auth API but a session cookie is present, we prefer
 * to render the page (and let the client re-validate) rather than bounce
 * the user to /auth/login on a transient network blip.
 */
export const hasSessionCookie = cache(async function hasSessionCookie(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    return cookieStore
      .getAll()
      .some(
        (c) =>
          c.name.startsWith("sb-") && c.name.includes("-auth-token") && !!c.value,
      )
  } catch {
    return false
  }
})

/**
 * Resilient server-side auth resolver.
 *
 * ROOT CAUSE THIS FIXES — Dashboard refresh loop:
 *   1. Dashboard layout called getUser() (4s timeout). On a slow Supabase
 *      Auth response, it returned null and redirected to /auth/login.
 *   2. Proxy saw an auth path + a session cookie and redirected to /dashboard.
 *   3. Step 1 re-ran with the same slow upstream — the page ping-ponged
 *      forever and the user saw a hanging, refreshing dashboard.
 *
 * Strategy (in order):
 *   1. supabase.auth.getUser() — verified against Supabase Auth API.
 *      Hard 3s budget. This is the canonical happy path.
 *   2. If (1) fails / times out AND a session cookie is present, fall back
 *      to supabase.auth.getSession() which reads the JWT from the cookie
 *      WITHOUT a network call. The JWT was already issued and signed by
 *      Supabase when the user logged in, and the proxy verifies the cookie
 *      on every protected request — so trusting it here is the same trust
 *      boundary the proxy already uses, and it breaks the redirect loop.
 *   3. If both fail, return null — the user really isn't authenticated.
 *
 * Memoized with React.cache() so the dashboard layout and the dashboard
 * page share the same result within a single request (no duplicate
 * Supabase round-trips).
 */
export const getUser = cache(async function getUser() {
  try {
    const supabase = await createClient()
    if (!supabase) return null

    type UserResult = Awaited<ReturnType<typeof supabase.auth.getUser>>
    const timeout = new Promise<UserResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            data: { user: null },
            error: new Error("getUser timeout") as never,
          } as UserResult),
        3000,
      ),
    )

    const { data, error } = await Promise.race([supabase.auth.getUser(), timeout])
    if (!error && data?.user) {
      return data.user
    }

    // Fallback: read session from the cookie storage. No network call —
    // @supabase/ssr decodes the JWT locally. This is what unblocks the
    // dashboard when Supabase Auth is slow but the session is still valid.
    const hasCookie = await hasSessionCookie()
    if (!hasCookie) return null

    type SessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>
    const sessionTimeout = new Promise<SessionResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            data: { session: null },
            error: null as never,
          } as SessionResult),
        1500,
      ),
    )

    const { data: sessionData } = await Promise.race([
      supabase.auth.getSession(),
      sessionTimeout,
    ])
    if (sessionData?.session?.user) {
      return sessionData.session.user
    }

    return null
  } catch {
    return null
  }
})

export const getProfile = cache(async function getProfile(userId: string) {
  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) return null
    const { data, error } = await adminSupabase.from("profiles").select("*").eq("id", userId).single()

    if (error || !data) {
      return null
    }
    return data
  } catch {
    return null
  }
})

export const getUserWithProfile = cache(async function getUserWithProfile() {
  const user = await getUser()
  if (!user) return { user: null, profile: null }
  const profile = await getProfile(user.id)
  return { user, profile }
})

export async function safeQuery<T>(
  queryFn: (supabase: NonNullable<ReturnType<typeof createAdminClient>>) => Promise<{ data: T | null; error: any }>,
  defaultValue: T,
): Promise<T> {
  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) return defaultValue
    const result = await queryFn(adminSupabase)
    if (result.error) {
      return defaultValue
    }
    return result.data ?? defaultValue
  } catch {
    return defaultValue
  }
}

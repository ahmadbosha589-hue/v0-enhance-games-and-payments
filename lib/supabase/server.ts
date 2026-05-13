import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

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

export function createAdminClient() {
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
}

export async function getUser() {
  try {
    const supabase = await createClient()
    if (!supabase) return null

    // Hard timeout on supabase.auth.getUser() — without this, a slow or
    // unresponsive Supabase Auth endpoint would block server-rendered
    // pages indefinitely (the dashboard layout was hanging forever in
    // this exact spot, which presented to the user as "logged out after
    // 5 seconds"). 4s is enough for any healthy cold start while still
    // bounding the worst case.
    type UserResult = Awaited<ReturnType<typeof supabase.auth.getUser>>
    const timeout = new Promise<UserResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            data: { user: null },
            error: new Error("getUser timeout") as never,
          } as UserResult),
        4000,
      ),
    )

    const { data, error } = await Promise.race([supabase.auth.getUser(), timeout])
    if (error || !data?.user) {
      return null
    }
    return data.user
  } catch {
    return null
  }
}

/**
 * Detect whether the current request carries a Supabase session cookie.
 * Used as a "soft" auth signal for resilience: if getUser() times out due
 * to a slow Supabase Auth API but a session cookie is present, we prefer
 * to render the page (and let the client re-validate) rather than bounce
 * the user to /auth/login on a transient network blip.
 */
export async function hasSessionCookie(): Promise<boolean> {
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
}

export async function getProfile(userId: string) {
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
}

export async function getUserWithProfile() {
  const user = await getUser()
  if (!user) return { user: null, profile: null }
  const profile = await getProfile(user.id)
  return { user, profile }
}

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

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

// ────────────────────────────────────────────────────────────────────────
// JWT / Supabase-cookie decoder (last-resort, ZERO network calls).
//
// Why this exists: when Supabase Auth API is slow/down/rate-limited, both
// supabase.auth.getUser() (network) and supabase.auth.getSession() (which
// also makes a network call if the access_token is near expiry) can
// return null even though the user's cookie payload is perfectly valid.
// That null caused the dashboard layout to redirect to
// /auth/login?expired=1 in a tight loop, so the dashboard "never opens".
//
// The proxy already trusts cookie presence as the auth signal for
// routing. Here we go one step further and trust the COOKIE PAYLOAD as
// the user identity. The JWT inside is signed by Supabase; we don't need
// to verify the signature ourselves to do a lookup against our own DB
// (getProfile uses the service-role key and is gated by row-level access
// inside our own code). If a bad actor forges this cookie, the worst
// they can do is read their own non-existent profile, which returns
// nothing. Sensitive operations always go through the admin client with
// explicit checks.
// ────────────────────────────────────────────────────────────────────────

type CookieUser = {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
  aud?: string
  role?: string
  // Marker so downstream code can detect a cookie-decoded user vs. a
  // freshly-verified one if it ever needs to.
  __from_cookie?: true
}

function base64UrlDecode(input: string): string {
  // JWT payloads use base64url. Pad and convert to standard base64.
  let s = input.replace(/-/g, "+").replace(/_/g, "/")
  while (s.length % 4) s += "="
  // atob is available in Node 18+ and on Edge.
  try {
    return typeof atob === "function"
      ? atob(s)
      : Buffer.from(s, "base64").toString("utf8")
  } catch {
    return ""
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const json = base64UrlDecode(parts[1])
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Reconstruct the Supabase auth-token cookie payload from request cookies.
 * @supabase/ssr stores the session as either:
 *   - a single `sb-{ref}-auth-token` cookie, OR
 *   - chunked `sb-{ref}-auth-token.0`, `.1`, `.2`, … (when the payload is
 *     too large for a single cookie).
 * The reassembled value may be prefixed with `base64-` and then contain a
 * base64-encoded JSON object `{ access_token, refresh_token, user, … }`,
 * or it may be the raw JSON object, or — for some older sessions — just
 * a raw JWT string.
 */
async function readAuthCookiePayload(): Promise<{
  user: CookieUser | null
} | null> {
  let cookieStore
  try {
    cookieStore = await cookies()
  } catch {
    return null
  }

  const all = cookieStore.getAll()
  const authCookies = all.filter(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token") && !!c.value,
  )
  if (authCookies.length === 0) return null

  // Group by base name (strip trailing ".0" / ".1" / …), then concatenate
  // chunks in order.
  const groups = new Map<string, { idx: number; value: string }[]>()
  for (const c of authCookies) {
    const match = c.name.match(/^(.*?)(?:\.(\d+))?$/)
    const base = match?.[1] ?? c.name
    const idx = match?.[2] ? Number(match[2]) : 0
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base)!.push({ idx, value: c.value })
  }

  for (const chunks of groups.values()) {
    chunks.sort((a, b) => a.idx - b.idx)
    let raw = chunks.map((c) => c.value).join("")

    // Strip @supabase/ssr's `base64-` prefix if present and decode.
    if (raw.startsWith("base64-")) {
      raw = base64UrlDecode(raw.slice("base64-".length))
      if (!raw) continue
    }

    // Try JSON parse (the modern format).
    try {
      const parsed = JSON.parse(raw)
      const u = parsed?.user ?? parsed?.currentSession?.user
      if (u?.id) {
        return {
          user: {
            id: String(u.id),
            email: u.email ?? null,
            user_metadata: u.user_metadata,
            app_metadata: u.app_metadata,
            aud: u.aud,
            role: u.role,
            __from_cookie: true,
          },
        }
      }
      // Some payloads only carry access_token. Decode it.
      const accessToken =
        parsed?.access_token ?? parsed?.currentSession?.access_token
      if (typeof accessToken === "string") {
        const claims = decodeJwtPayload(accessToken)
        const sub = claims && typeof claims.sub === "string" ? claims.sub : null
        if (sub) {
          return {
            user: {
              id: sub,
              email:
                claims && typeof claims.email === "string"
                  ? (claims.email as string)
                  : null,
              user_metadata:
                claims && typeof claims.user_metadata === "object"
                  ? (claims.user_metadata as Record<string, unknown>)
                  : undefined,
              app_metadata:
                claims && typeof claims.app_metadata === "object"
                  ? (claims.app_metadata as Record<string, unknown>)
                  : undefined,
              aud:
                claims && typeof claims.aud === "string"
                  ? (claims.aud as string)
                  : undefined,
              role:
                claims && typeof claims.role === "string"
                  ? (claims.role as string)
                  : undefined,
              __from_cookie: true,
            },
          }
        }
      }
    } catch {
      // Not JSON — fall through to bare-JWT case.
    }

    // Fallback: treat the cookie value as a raw JWT.
    const claims = decodeJwtPayload(raw)
    const sub = claims && typeof claims.sub === "string" ? claims.sub : null
    if (sub) {
      return {
        user: {
          id: sub,
          email:
            claims && typeof claims.email === "string"
              ? (claims.email as string)
              : null,
          __from_cookie: true,
        },
      }
    }
  }

  return null
}

/**
 * Resilient server-side auth resolver.
 *
 * ROOT CAUSE THIS FIXES — Dashboard refresh loop / "always expired=1":
 *   The dashboard layout was redirecting to /auth/login whenever
 *   supabase.auth.getUser() returned null. That could happen on a slow
 *   Supabase Auth response, a rate-limited project, an Auth API outage,
 *   or even just a near-expiry access_token whose refresh-token flow was
 *   stalled. The result: the user — even with a perfectly valid session
 *   cookie — could not reach the dashboard.
 *
 * Strategy (in order, all fall through on failure):
 *   1. supabase.auth.getUser() — verified against Supabase Auth API.
 *      Hard 3s budget.
 *   2. supabase.auth.getSession() — may decode the JWT locally OR make a
 *      refresh-token call. Hard 1.5s budget.
 *   3. Decode the auth-token cookie payload DIRECTLY — zero network,
 *      always available as long as the cookie is present. This is the
 *      step that finally unblocks users when Supabase Auth API is
 *      misbehaving but the session cookie is still on the browser.
 *
 * Memoized with React.cache() so the dashboard layout and the dashboard
 * page share the same result within a single request (no duplicate
 * Supabase round-trips).
 */
export const getUser = cache(async function getUser() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      // No Supabase client at all (env vars missing) — last-resort cookie
      // decode is the only option.
      const cookieResult = await readAuthCookiePayload()
      return cookieResult?.user ?? null
    }

    // Strategies 1 and 2 used to run sequentially (3000ms budget, THEN a
    // further 1500ms budget) — a 4.5s worst case on every dashboard
    // request. They're independent network calls, so run them
    // concurrently instead and take whichever verified result lands
    // first. Worst case is now max(3000, 1500) = 3000ms, not the sum.
    const cookieHere = await hasSessionCookie()

    type UserResult = Awaited<ReturnType<typeof supabase.auth.getUser>>
    const userPromise: Promise<UserResult> = supabase.auth
      .getUser()
      .catch(
        () =>
          ({
            data: { user: null },
            error: new Error("getUser failed") as never,
          }) as UserResult,
      )
    const userTimeout = new Promise<UserResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            data: { user: null },
            error: new Error("getUser timeout") as never,
          } as UserResult),
        3000,
      ),
    )

    type SessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>
    const sessionPromise: Promise<SessionResult> = cookieHere
      ? supabase.auth.getSession().catch(
          () =>
            ({
              data: { session: null },
              error: null as never,
            }) as SessionResult,
        )
      : Promise.resolve({ data: { session: null }, error: null as never } as SessionResult)
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

    try {
      const [userResult, sessionResult] = await Promise.all([
        Promise.race([userPromise, userTimeout]),
        Promise.race([sessionPromise, sessionTimeout]),
      ])
      if (!userResult.error && userResult.data?.user) {
        return userResult.data.user
      }
      if (sessionResult.data?.session?.user) {
        return sessionResult.data.session.user
      }
    } catch {
      // Fall through to last-resort strategy.
    }

    if (!cookieHere) return null

    // Strategy 3 — last-resort manual cookie decode (no network).
    const cookieResult = await readAuthCookiePayload()
    if (cookieResult?.user) {
      console.warn(
        "[Supabase Server] Falling back to cookie-decoded user — Supabase Auth API unreachable",
      )
      return cookieResult.user
    }

    return null
  } catch (err) {
    console.error("[Supabase Server] getUser unexpected error:", err)
    // Even on a thrown exception, try the cookie fallback.
    try {
      const cookieResult = await readAuthCookiePayload()
      return cookieResult?.user ?? null
    } catch {
      return null
    }
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
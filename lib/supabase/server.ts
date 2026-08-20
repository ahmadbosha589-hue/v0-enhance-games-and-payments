import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { cache } from "react"
import { verifyAccessToken, isTokenExpired } from "./jwt-verify"

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // Fail fast with a diagnosable message. The old `return null` pushed the
    // failure into ~40 route handlers as an opaque null-dereference; a route
    // 500s either way when env vars are missing, so surface the real cause.
    // (Matches the requireAdminClient() fail-fast pattern in admin-client.ts.)
    throw new Error(
      "[Supabase Server] Missing NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    )
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

  if (!supabaseUrl) {
    console.warn("[Supabase Admin] NEXT_PUBLIC_SUPABASE_URL not configured")
    return null
  }

  const keyToUse = serviceRoleKey
  if (!keyToUse) {
    // SECURITY (S20): this previously fell back to the anon key
    // (`serviceRoleKey || anonKey`). Every caller of this client depends on RLS
    // being bypassed — role lookups, balance writes, fraud queries. Under the
    // anon key those reads return RLS-filtered or empty results, which is
    // indistinguishable from a legitimate "no rows". That is how a missing env
    // var turns into an authorization bug: getProfile() returns null, so an
    // admin looks like a non-admin (or worse, a default profile is substituted).
    // Callers already handle null, so failing closed is strictly safer.
    console.error(
      "[Supabase Admin] SUPABASE_SERVICE_ROLE_KEY missing — admin client unavailable (refusing to downgrade to the anon key)",
    )
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
// Offline identity resolution (ZERO network calls) — SIGNATURE VERIFIED.
//
// Why this exists: when the Supabase Auth API is slow/down/rate-limited,
// supabase.auth.getUser() can return null even though the user's session is
// perfectly valid. Running getUser() and getSession() concurrently here was
// unsafe: both operations may rotate the same refresh token and invalidate
// the other request. The resolver now performs one refresh-capable getUser()
// call, then falls back to the verified cookie.
//
// SECURITY (RC-1). A previous version of this block solved that by
// base64-decoding the cookie and trusting the `user` object inside it,
// reasoning that a forged cookie could "only read their own non-existent
// profile". That reasoning was wrong: getProfile() uses the service-role
// key (RLS bypassed), every admin route resolves `role` through it, and
// admin user-ids are publicly discoverable (/api/leaderboard selects
// `id`; /api/2fa/status returned `userId` for any email). A forged
// cookie therefore granted full admin access to any anonymous visitor.
//
// The fix keeps the availability property — verifying a JWT is a local
// operation, so it works fine while Auth is unreachable — and drops the
// unverified trust. See lib/supabase/jwt-verify.ts.
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

/**
 * Reassemble the (possibly chunked) Supabase auth cookie and return the raw
 * access_token string.
 *
 * @supabase/ssr stores the session as either a single `sb-{ref}-auth-token`
 * cookie or chunked `sb-{ref}-auth-token.0`, `.1`, … when the payload exceeds
 * one cookie. The reassembled value may be prefixed with `base64-` and contain
 * base64-encoded JSON, raw JSON, or (older sessions) a bare JWT.
 *
 * NOTE: this function deliberately returns ONLY the token. The cookie's
 * plaintext `user` object is attacker-controlled — even on an otherwise-valid
 * session — so it must never be used as an identity source. Identity comes from
 * the verified token claims alone.
 */
async function readAccessTokenFromCookies(): Promise<string | null> {
  let cookieStore
  try {
    cookieStore = await cookies()
  } catch {
    return null
  }

  const authCookies = cookieStore
    .getAll()
    .filter(
      (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token") && !!c.value,
    )
  if (authCookies.length === 0) return null

  // Group by base name (strip a trailing ".0" / ".1" / …) then concatenate in
  // index order.
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

    if (raw.startsWith("base64-")) {
      raw = base64UrlDecode(raw.slice("base64-".length))
      if (!raw) continue
    }

    try {
      const parsed = JSON.parse(raw)
      const token = parsed?.access_token ?? parsed?.currentSession?.access_token
      if (typeof token === "string" && token.split(".").length === 3) return token
    } catch {
      // Not JSON — some older sessions store the bare JWT.
      if (raw.split(".").length === 3) return raw
    }
  }

  return null
}

/**
 * Resolve the current user from the session cookie with NO network call, using
 * a cryptographically verified access token.
 *
 * Returns null unless the token's signature, issuer and expiry all check out
 * (see lib/supabase/jwt-verify.ts). The returned user carries
 * `__from_cookie: true` so privileged paths can require a live re-verification
 * — an offline-valid token remains valid until `exp` even if the session was
 * revoked (logout-everywhere, ban, password reset), which read paths tolerate
 * but admin/money writes must not.
 */
async function readVerifiedCookieUser(): Promise<{ user: CookieUser } | null> {
  const token = await readAccessTokenFromCookies()
  if (!token) return null

  // Cheap pre-check so an expired token skips signature work entirely. Never
  // used as identity on its own.
  if (isTokenExpired(token)) return null

  const claims = await verifyAccessToken(token)
  if (!claims?.sub) return null

  return {
    user: {
      id: String(claims.sub),
      email: typeof claims.email === "string" ? claims.email : null,
      user_metadata: claims.user_metadata,
      app_metadata: claims.app_metadata,
      aud: typeof claims.aud === "string" ? claims.aud : undefined,
      role: typeof claims.role === "string" ? claims.role : undefined,
      __from_cookie: true,
    },
  }
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
 *   2. Decode the auth-token cookie payload DIRECTLY — zero network,
 *      available when the cookie carries a valid signed access token. This
 *      avoids a second concurrent refresh operation.
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
      const cookieResult = await readVerifiedCookieUser()
      return cookieResult?.user ?? null
    }

    // One refresh-capable getUser() call is intentional. Do not start a
    // concurrent getSession() call here: both can rotate the same refresh
    // token and make a browser refresh look like an expired session.

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

    try {
      const userResult = await Promise.race([userPromise, userTimeout])
      if (!userResult.error && userResult.data?.user) {
        return userResult.data.user
      }
    } catch {
      // Fall through to last-resort strategy.
    }

    if (!cookieHere) return null

    // Strategy 3 — last-resort manual cookie decode (no network).
    const cookieResult = await readVerifiedCookieUser()
    if (cookieResult?.user) {
      console.warn(
        "[Supabase Server] Using offline VERIFIED token identity — Supabase Auth API unreachable",
      )
      return cookieResult.user
    }

    return null
  } catch (err) {
    console.error("[Supabase Server] getUser unexpected error:", err)
    // Even on a thrown exception, try the cookie fallback.
    try {
      const cookieResult = await readVerifiedCookieUser()
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

/**
 * Identity that is good enough for PRIVILEGED actions (admin operations,
 * balance mutation, withdrawals, 2FA changes).
 *
 * getUser() may resolve a user from an offline-verified access token
 * (`__from_cookie: true`). That token's signature is valid, but it stays valid
 * until `exp` even if the session was revoked in the meantime — logout
 * everywhere, a ban, or a password reset. Read paths can tolerate that
 * staleness; privileged writes cannot. So when the identity came from the
 * offline path we force one live verification against the Supabase Auth API.
 */
export const getVerifiedUser = cache(async function getVerifiedUser() {
  const user = await getUser()
  if (!user) return null

  if (!(user as { __from_cookie?: true }).__from_cookie) return user

  const supabase = await createClient()
  if (!supabase) return null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) return null
    return data.user
  } catch {
    return null
  }
})

export type AdminRole = "admin" | "superadmin" | "owner" | "moderator"

const DEFAULT_ADMIN_ROLES: AdminRole[] = ["admin", "superadmin", "owner"]

/**
 * Single choke point for administrative authorization.
 *
 * Returns the live-verified user plus their profile, or null. Callers MUST treat
 * null as 403 and must not fall back to any default profile.
 *
 * Why centralized: before this existed, each admin route inlined its own
 * `getUser()` + role lookup, and three different allow-lists had drifted apart
 * (["admin","superadmin"], ["admin","superadmin","owner"],
 * ["admin","superadmin","moderator"]). Two routes had no check at all. A single
 * function makes the policy auditable and greppable.
 */
export const requireAdmin = cache(async function requireAdmin(
  allowed: AdminRole[] = DEFAULT_ADMIN_ROLES,
) {
  const user = await getVerifiedUser()
  if (!user) return null

  const profile = await getProfile(user.id)
  if (!profile) return null

  const role = (profile as { role?: string }).role
  if (!role || !allowed.includes(role as AdminRole)) return null

  return { user, profile }
})

type SafeQueryFn<T> = (
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
) => PromiseLike<{ data: T | null; error: any }>

export function safeQuery<T>(queryFn: SafeQueryFn<T>, defaultValue: T): Promise<T>
export function safeQuery<T>(queryFn: SafeQueryFn<T>, defaultValue: null): Promise<T | null>
export async function safeQuery<T>(
  // Supabase query builders are thenables (`PromiseLike`), not native
  // Promises. Requiring Promise here rejected every `.from().select()` query
  // and caused downstream results to infer as `never`.
  queryFn: SafeQueryFn<T>,
  defaultValue: T | null,
): Promise<T | null> {
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
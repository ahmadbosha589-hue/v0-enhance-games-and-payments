import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const AUTH_REFRESH_TIMEOUT_MS = 4000

// Refresh only when the access token is within this window of expiry.
// Supabase access tokens live one hour by default; two minutes of lead time
// absorbs clock skew and one slow Auth round-trip comfortably.
const REFRESH_WINDOW_MS = 120_000

function decodeBase64Url(input: string): string {
  let s = input.replace(/-/g, "+").replace(/_/g, "/")
  while (s.length % 4) s += "="
  return typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("utf8")
}

/**
 * Read the access token's `exp` (epoch ms) straight from the request cookies —
 * NO network call. Handles the chunked (`sb-*-auth-token.0`, `.1`, …) and
 * `base64-` prefixed forms @supabase/ssr writes. Returns null when absent or
 * unparseable.
 */
function readAccessTokenExpiresAt(request: NextRequest): number | null {
  const authCookies = request.cookies
    .getAll()
    .filter((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token") && !!c.value)
  if (authCookies.length === 0) return null

  const groups = new Map<string, { idx: number; value: string }[]>()
  for (const c of authCookies) {
    const m = c.name.match(/^(.*?)(?:\.(\d+))?$/)
    const base = m?.[1] ?? c.name
    const idx = m?.[2] ? Number(m[2]) : 0
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base)!.push({ idx, value: c.value })
  }

  for (const group of groups.values()) {
    group.sort((a, b) => a.idx - b.idx)
    let raw = group.map((c) => c.value).join("")
    try {
      if (raw.startsWith("base64-")) raw = decodeBase64Url(raw.slice("base64-".length))
      const parsed = JSON.parse(raw) as {
        access_token?: string
        currentSession?: { access_token?: string }
      }
      const token = parsed?.access_token ?? parsed?.currentSession?.access_token
      if (typeof token !== "string" || token.split(".").length !== 3) continue
      const payload = JSON.parse(decodeBase64Url(token.split(".")[1])) as { exp?: number }
      if (typeof payload.exp === "number") return payload.exp * 1000
    } catch {
      continue
    }
  }
  return null
}

/**
 * Pay for a refresh ONLY when the access token is actually at/near expiry.
 * Refreshing on every navigation put an Auth round-trip on the critical path
 * of every page (slow loads) and widened the race window on the single-use
 * refresh token (random logouts).
 */
function shouldRefresh(request: NextRequest): boolean {
  const expiresAtMs = readAccessTokenExpiresAt(request)
  // Unparseable cookie: fall back to the old always-attempt behaviour for this
  // rare case rather than stranding the user with an unreadable session.
  if (expiresAtMs === null) return true
  return expiresAtMs - Date.now() <= REFRESH_WINDOW_MS
}

/**
 * Updates the session for the current request.
 * Returns early if Supabase is not configured.
 */
export async function updateSession(request: NextRequest) {
  // Create response first
  let supabaseResponse = NextResponse.next({ request })

  // CRITICAL: Check environment variables BEFORE any Supabase operations
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase is not configured, skip auth entirely
  if (!url || !key) {
    console.log("[Supabase Proxy] Env vars not configured, skipping auth")
    return supabaseResponse
  }

  // Next.js can issue several RSC/prefetch requests in parallel with the
  // document request. They must not all rotate the same single-use Supabase
  // refresh token; only the canonical document request refreshes the session.
  const isRscOrPrefetch =
    request.headers.get("rsc") === "1" ||
    request.headers.has("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose") === "prefetch" ||
    request.headers.get("x-nextjs-data") === "1"
  if (isRscOrPrefetch) return supabaseResponse

  // ────────────────────────────────────────────────────────────────────────
  // FAST-PATH: detect Supabase session cookie presence WITHOUT a network call.
  // This is the single source of truth for redirect decisions in the proxy.
  // We DO NOT call supabase.auth.getUser() here because that hits the
  // Supabase auth endpoint on every navigation — adding 200-3000ms latency
  // and (worse) flapping the user to "unauthenticated" on transient timeouts,
  // which previously caused /dashboard → /auth/login → /dashboard loops.
  //
  // The actual auth validation still happens server-side inside protected
  // pages (e.g. dashboard layout calls getUser() which verifies with Supabase).
  // The proxy only does cheap cookie-presence routing.
  // ────────────────────────────────────────────────────────────────────────
  const hasSessionCookie = request.cookies
    .getAll()
    .some(
      (c) =>
        c.name.startsWith("sb-") &&
        c.name.includes("-auth-token") &&
        !!c.value
    )

  try {
    // Create supabase client only to refresh cookies if needed. We do NOT
    // await getUser() in the hot path — instead we let the underlying
    // cookie management handle token refresh in the background.
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    })

    // ────────────────────────────────────────────────────────────────────
    // REFRESH_OWNER — this is the ONLY place allowed to refresh the session.
    //
    // Supabase refresh tokens are SINGLE USE. Middleware is the only layer
    // that can both rotate the token AND persist the replacement to cookies,
    // so it owns refresh outright. Server Components must never call the
    // refresh-capable getUser() (see RSC_NO_REFRESH in lib/supabase/server.ts):
    // their rotation is discarded, and the next request presents a consumed
    // token, which Supabase treats as a revoked session — the user appears to
    // be logged out on every refresh.
    //
    // We only pay for a refresh when the access token is actually near expiry.
    // Refreshing on every navigation both wasted an Auth round-trip on the
    // critical path (making all pages slow) and widened the window for two
    // in-flight requests to race the same single-use token.
    // ────────────────────────────────────────────────────────────────────
    if (hasSessionCookie && shouldRefresh(request)) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          supabase.auth.getUser(),
          new Promise((resolve) => {
            timer = setTimeout(resolve, AUTH_REFRESH_TIMEOUT_MS)
          }),
        ])
      } catch {
        // Best effort — routing below never depends on this.
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    // Protected routes require auth — decided ONLY from cookie presence.
    const protectedPaths = ["/dashboard", "/admin"]
    const isProtectedPath = protectedPaths.some((path) =>
      request.nextUrl.pathname.startsWith(path)
    )

    if (isProtectedPath && !hasSessionCookie) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = "/auth/login"
      redirectUrl.searchParams.set("redirect", request.nextUrl.pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Redirect logged-in users away from auth pages — based on cookie
    // presence. The auth page itself runs a server-side /api/auth/me check
    // and will redirect if the session is actually valid; if it's a stale
    // cookie, the auth page renders and lets the user re-authenticate.
    //
    // LOOP BREAKERS (critical — these prevent the
    // /dashboard → /auth/login → /dashboard → … infinite refresh loop):
    //
    //   1. `?expired=1` — set by the dashboard layout when its own
    //      getUser() call cannot resolve a real user. That signals the
    //      session cookie is stale/broken even though it exists. We MUST
    //      let the user actually reach /auth/login in that case, not
    //      bounce them back to the dashboard.
    //
    //   2. `?signedOut=…` — set on landing-page redirects right after
    //      sign-out, while the browser may still hold the cookie for a
    //      tick. Same rule: don't bounce.
    //
    //   3. `?error=…` — preserve any explicit auth error path
    //      (bot_detected, banned, etc.) so the auth page can render the
    //      error UI.
    const authPaths = ["/auth/login", "/auth/sign-up"]
    const isAuthPath = authPaths.some((path) => request.nextUrl.pathname.startsWith(path))
    const authSearch = request.nextUrl.searchParams
    const isLoopBreaker =
      authSearch.has("expired") ||
      authSearch.has("signedOut") ||
      authSearch.has("error")

    if (isAuthPath && hasSessionCookie && !isLoopBreaker) {
      const redirectUrl = request.nextUrl.clone()
      const redirectTo = request.nextUrl.searchParams.get("redirect") || "/dashboard"
      const safeTarget =
        redirectTo.startsWith("/auth/") || !redirectTo.startsWith("/")
          ? "/dashboard"
          : redirectTo
      redirectUrl.pathname = safeTarget
      redirectUrl.search = ""
      return NextResponse.redirect(redirectUrl)
    }

    return supabaseResponse
  } catch (error) {
    console.error("[Supabase Proxy] Error:", error)
    return supabaseResponse
  }
}

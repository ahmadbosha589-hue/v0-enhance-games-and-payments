import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const AUTH_REFRESH_TIMEOUT_MS = 8000

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
    // CRITICAL ARCHITECTURE: routing decisions use ONLY cookie presence.
    // We do NOT await getUser() here. Awaiting it caused 5+ second hangs
    // on every navigation when Supabase Auth was slow (which immediately
    // followed by the dashboard layout doing ANOTHER unbounded getUser(),
    // appearing to the user as "logged out after 5 seconds").
    //
    // @supabase/ssr refreshes the access-token cookie when it's near
    // expiry. We wait up to AUTH_REFRESH_TIMEOUT_MS for that operation so
    // the rotated cookie is actually copied to the response before the
    // browser refresh completes. Returning earlier drops the new cookie and
    // makes the next refresh appear logged out.
    // Routing is decided ONLY from hasSessionCookie.
    // ────────────────────────────────────────────────────────────────────
    try {
      await Promise.race([
        supabase.auth.getUser(),
        new Promise((resolve) => setTimeout(resolve, AUTH_REFRESH_TIMEOUT_MS)),
      ])
    } catch {
      // Best effort — ignore.
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

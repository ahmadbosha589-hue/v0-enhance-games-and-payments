import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

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

    // Kick off (and AWAIT) getUser() so @supabase/ssr can refresh the
    // access token cookie if it's near expiry. We cap the await at 5s
    // (was 1.5s — too aggressive: it timed out before Supabase could
    // refresh the token cookie on cold starts, leaving the user with
    // cookies the server kept rejecting → /dashboard → /auth/login →
    // /dashboard infinite loop). 5s is enough for any reasonable cold
    // start while still preventing a totally-dead Supabase from blocking
    // every navigation.
    let verifiedUser: { id: string } | null = null
    try {
      const userPromise = supabase.auth.getUser()
      const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((resolve) =>
        setTimeout(
          () => resolve({ data: { user: null }, error: new Error("Auth timeout") }),
          5000
        )
      )
      const result = await Promise.race([userPromise, timeoutPromise])
      verifiedUser = result?.data?.user ?? null
    } catch {
      // Network error — fall through to cookie-presence heuristic
    }

    // ── Decide auth state ──
    // hasUser is true if EITHER we got a verified user OR a session cookie
    // is present (we trust the cookie shape; if it's invalid the page itself
    // will redirect via its own server-side getUser() check).
    const hasUser = !!verifiedUser || hasSessionCookie

    // Protected routes require auth
    const protectedPaths = ["/dashboard", "/admin"]
    const isProtectedPath = protectedPaths.some((path) =>
      request.nextUrl.pathname.startsWith(path)
    )

    if (isProtectedPath && !hasUser) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = "/auth/login"
      redirectUrl.searchParams.set("redirect", request.nextUrl.pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Redirect logged-in users away from auth pages — but ONLY if we have a
    // verified user. We do NOT redirect on cookie-presence alone, because a
    // stale/expired cookie would bounce the user to /dashboard which then
    // bounces them back, creating a loop. Letting the auth page render and
    // run its own client-side check is the safe path on cookie-only state.
    const authPaths = ["/auth/login", "/auth/sign-up"]
    const isAuthPath = authPaths.some((path) => request.nextUrl.pathname.startsWith(path))

    if (isAuthPath && verifiedUser) {
      const redirectUrl = request.nextUrl.clone()
      const redirectTo = request.nextUrl.searchParams.get("redirect") || "/dashboard"
      // Sanitize: never redirect back to an auth page (loop guard)
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

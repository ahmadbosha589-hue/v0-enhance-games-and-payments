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

  try {
    // Create fresh Supabase client for each request
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

    // Get user with timeout to prevent hanging
    const userPromise = supabase.auth.getUser()
    const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: { user: null }, error: new Error("Auth timeout") }), 3000)
    )

    let user = null
    try {
      const result = await Promise.race([userPromise, timeoutPromise])
      user = result.data?.user
    } catch (e) {
      // Auth failed, continue without user
      return supabaseResponse
    }

    // Protected routes require auth
    const protectedPaths = ["/dashboard", "/admin"]
    const isProtectedPath = protectedPaths.some((path) =>
      request.nextUrl.pathname.startsWith(path)
    )

    if (isProtectedPath && !user) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      url.searchParams.set("redirect", request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }

    // Redirect logged-in users away from auth pages
    const authPaths = ["/auth/login", "/auth/sign-up"]
    const isAuthPath = authPaths.some((path) => request.nextUrl.pathname.startsWith(path))

    if (isAuthPath && user) {
      const url = request.nextUrl.clone()
      const redirectTo = request.nextUrl.searchParams.get("redirect") || "/dashboard"
      url.pathname = redirectTo
      url.search = ""
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch (error) {
    console.error("[Supabase Proxy] Error:", error)
    return supabaseResponse
  }
}

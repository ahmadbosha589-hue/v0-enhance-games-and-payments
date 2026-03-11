import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    })

    const userPromise = supabase.auth.getUser()
    const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: { user: null }, error: new Error("Auth timeout") }), 2000),
    )

    let user = null
    try {
      const result = await Promise.race([userPromise, timeoutPromise])
      user = result.data?.user
    } catch (e) {
      console.warn("[Proxy] Auth service unavailable, continuing as guest:", e)
      return supabaseResponse
    }

    // Protected routes
    const protectedPaths = ["/dashboard", "/admin"]
    const isProtectedPath = protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path))

    if (isProtectedPath && !user) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      url.searchParams.set("redirect", request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }

    // Admin pages will verify role client-side, which is more responsive

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
    console.warn("[Proxy] Supabase error, continuing without auth:", error)
    return NextResponse.next({ request })
  }
}

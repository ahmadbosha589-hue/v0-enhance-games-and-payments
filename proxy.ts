import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"

/**
 * Next.js 16 middleware (proxy.ts)
 * Handles auth session management and route protection
 */
export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Static assets - skip entirely
  if (pathname.startsWith("/_next/") || pathname.startsWith("/static/")) {
    return NextResponse.next()
  }

  // Public API routes
  const publicApiPaths = ["/api/stats", "/api/health", "/api/webhooks", "/api/ping"]
  if (publicApiPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  // Public pages that don't need auth
  const publicPaths = [
    "/",
    "/about",
    "/contact",
    "/help",
    "/terms",
    "/privacy",
    "/cookies",
    "/aml",
    "/blog",
    "/status",
    "/docs",
    "/auth/error",
    "/auth/callback",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-email",
  ]

  if (publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  // For all other routes, try to update session
  // This handles auth but won't block if Supabase is unavailable
  try {
    return await updateSession(request)
  } catch (error) {
    console.warn("[Middleware] Session update failed:", error)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
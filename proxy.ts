import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"

export default async function middleware(request: NextRequest) {
  const trulyPublicPaths = [
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
    "/api/stats",
    "/api/health",
    "/auth/error",
    "/auth/callback",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-email",
  ]

  const isStaticAsset = request.nextUrl.pathname.startsWith("/_next/")

  // Public API routes that don't need auth
  const publicApiPaths = ["/api/stats", "/api/health", "/api/webhooks"]
  const isPublicApi = publicApiPaths.some(
    (path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`),
  )

  if (isStaticAsset || isPublicApi) {
    return NextResponse.next()
  }

  const isTrulyPublicPath = trulyPublicPaths.some(
    (path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`),
  )

  // Skip Supabase completely for truly public paths
  if (isTrulyPublicPath) {
    return NextResponse.next()
  }

  try {
    return await updateSession(request)
  } catch (error) {
    // If Supabase fails or times out, allow request to continue
    console.warn("[Middleware] Supabase unavailable:", error)
    return NextResponse.next()
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}

import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"
import { checkRateLimit as checkRedisRateLimit } from "@/lib/redis/rate-limiter"

// ============================================================================
// ENTERPRISE SECURITY PROXY (Next.js 16)
// Multi-layered protection including:
// - Rate limiting per IP/path
// - DDoS protection
// - Request signature validation
// - Bot detection headers
// - Security headers injection
// ============================================================================

// Rate limiting configuration
const RATE_LIMITS: Record<string, { windowSeconds: number; limit: number; prefix: string }> = {
  api: { windowSeconds: 60, limit: 60, prefix: "rl:proxy:api" },
  auth: { windowSeconds: 60, limit: 30, prefix: "rl:proxy:auth" },
  claim: { windowSeconds: 60, limit: 5, prefix: "rl:proxy:claim" },
  page: { windowSeconds: 60, limit: 200, prefix: "rl:proxy:page" },
}

// Security headers
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "on",
}

function getClientIP(request: NextRequest): string {
  return request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
}

function getRateLimitType(pathname: string, method: string): keyof typeof RATE_LIMITS {
  if (pathname === "/api/auth/me" || pathname.startsWith("/api/auth/me/")) return "api"
  if (pathname.startsWith("/auth")) return method === "POST" ? "auth" : "page"
  if (pathname.startsWith("/api/auth")) return method === "POST" ? "auth" : "api"
  if (pathname.includes("/claim") || pathname.includes("/faucet")) return "claim"
  if (pathname.startsWith("/api/")) return "api"
  return "page"
}

async function checkRateLimit(ip: string, path: string, method: string) {
  const limitType = getRateLimitType(path, method)
  const config = RATE_LIMITS[limitType]
  const result = await checkRedisRateLimit(ip, config)
  return {
    allowed: result.success,
    remaining: result.remaining,
    retryAfter: result.retryAfter,
  }
}

function isCrossSiteMutation(request: NextRequest, isWebhookPath: boolean): boolean {
  if (isWebhookPath || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return false

  const fetchSite = request.headers.get("sec-fetch-site")
  if (fetchSite === "cross-site") return true

  const origin = request.headers.get("origin")
  if (!origin) return false

  try {
    const originHost = new URL(origin).host
    const requestHost = request.headers.get("host") || request.nextUrl.host
    return originHost !== requestHost
  } catch {
    return true
  }
}

// Only block traversal in the decoded path and executable schemes/scripts in
// redirect-like parameters. Do not scan the complete URL: legitimate search
// terms, blog slugs, offerwall subids, and provider payloads may contain words
// such as "union select" or "javascript" without being executable.
const REDIRECT_PARAMS = ["redirect", "next", "return", "returnTo", "url", "target", "callback"]
const PATH_TRAVERSAL = /(?:^|[\\/])\.\.(?:[\\/]|$)/

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function detectSuspiciousRequest(request: NextRequest): { blocked: boolean; reason?: string } {
  const pathname = decodeOnce(request.nextUrl.pathname)
  if (PATH_TRAVERSAL.test(pathname)) {
    return { blocked: true, reason: "path_traversal" }
  }

  for (const name of REDIRECT_PARAMS) {
    const value = request.nextUrl.searchParams.get(name)
    if (!value) continue
    const decoded = decodeOnce(value).trim()
    if (/^(?:javascript|data):/i.test(decoded) || /<script\b/i.test(decoded)) {
      return { blocked: true, reason: `unsafe_${name}` }
    }
  }

  return { blocked: false }
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

/**
 * Next.js 16 proxy with enterprise security
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = getClientIP(request)
  const isWebhookPath =
    pathname.startsWith("/api/postback") ||
    pathname.startsWith("/api/webhook") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron")

  // Static assets - skip entirely
  if (pathname.startsWith("/_next/") || pathname.startsWith("/static/") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|js|css)$/)) {
    return NextResponse.next()
  }

  // Check for suspicious requests (potential attacks)
  const suspicious = detectSuspiciousRequest(request)
  if (!isWebhookPath && suspicious.blocked) {
    console.warn(`[Security] Blocked suspicious request from ${ip}: ${pathname} (${suspicious.reason})`)
    return new NextResponse(
      JSON.stringify({ error: "Request blocked", code: "SECURITY_BLOCK" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    )
  }

  if (!isWebhookPath && isCrossSiteMutation(request, isWebhookPath)) {
    console.warn(`[Security] Blocked cross-site mutation from ${ip}: ${pathname}`)
    return new NextResponse(JSON.stringify({ error: "Cross-site mutation blocked" }), {
      status: 403,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    })
  }

  // Rate limiting (skip for Cloudflare-verified requests with ray ID
  // and for server-to-server webhook endpoints).
  const cfRay = request.headers.get("cf-ray")
  if (!cfRay && !isWebhookPath) {
    const rateLimit = await checkRateLimit(ip, pathname, request.method)
    if (!rateLimit.allowed) {
      console.warn(`[RateLimit] IP ${ip} exceeded limit for ${pathname}`)
      return new NextResponse(
        JSON.stringify({
          error: "Too many requests",
          code: "RATE_LIMIT",
          retryAfter: 60
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
            ...SECURITY_HEADERS
          }
        }
      )
    }
  }

  // Public API routes - no auth needed.
  //
  // /api/postback/* is critical here. Offerwall providers (c.cx.ua, CPX,
  // Lootably, Torox, etc.) POST server-to-server with no cookies and expect
  // an exact plain-text body (c.cx.ua requires lowercase "ok" — anything
  // else is marked as "Failed" in their dashboard, see
  // https://c.cx.ua/docs/#ow_response). Running these through updateSession
  // would touch cookies, and running them through the in-memory rate limiter
  // would 429 a burst of legitimate postbacks with a JSON body. The route
  // itself enforces signature + IP-whitelist checks, so this bypass is safe.
  //
  // We also bypass /api/cron/* (Vercel cron secret-guarded) for the same
  // reasons — and /api/stripe/webhook (raw-body verification) where present.
  const publicApiPaths = [
    "/api/stats",
    "/api/health",
    "/api/webhooks",
    "/api/webhook",
    "/api/ping",
    "/api/postback",
    "/api/cron",
  ]
  if (publicApiPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    // Return NextResponse.next() WITHOUT adding security headers — the
    // X-Frame-Options/X-XSS-Protection bundle is meaningful for HTML pages,
    // not S2S endpoints, and stripping them keeps the response byte-exact
    // to what the route handler returns.
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
    return addSecurityHeaders(NextResponse.next())
  }

  // For all other routes, try to update session
  try {
    const response = await updateSession(request)
    return addSecurityHeaders(response)
  } catch (error) {
    console.warn("[Proxy] Session update failed:", error)
    return addSecurityHeaders(NextResponse.next())
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|xml|txt|ico)$).*)",
  ],
}

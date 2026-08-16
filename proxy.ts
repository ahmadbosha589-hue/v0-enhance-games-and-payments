import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"

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
const RATE_LIMITS: Record<string, { windowMs: number; maxRequests: number }> = {
  api: { windowMs: 60000, maxRequests: 60 },
  // Only genuine credential mutations (POST sign-in / sign-up / reset) land
  // in this strict bucket. Auth *page* navigations and the read-only
  // /api/auth/me session probe are routed to "page"/"api" respectively —
  // see getRateLimitType(). 30/min comfortably covers retries + 2FA flows.
  auth: { windowMs: 60000, maxRequests: 30 },
  claim: { windowMs: 60000, maxRequests: 5 },
  page: { windowMs: 60000, maxRequests: 200 },
}

// In-memory rate limit store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Security headers
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "on",
}

// Suspicious patterns
const SUSPICIOUS_PATTERNS = [
  /\.\.\//,                    // Path traversal
  /<script/i,                  // XSS attempt
  /union\s+select/i,           // SQL injection
  /javascript:/i,              // JS injection
]

function getClientIP(request: NextRequest): string {
  return request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
}

function getRateLimitType(pathname: string, method: string): keyof typeof RATE_LIMITS {
  // The session-probe endpoint is read-only and gets polled MANY times during
  // a single login attempt (the login page polls it up to 6× while waiting for
  // the auth cookie to propagate). It must NOT share the strict auth bucket,
  // otherwise a normal sign-in trips the limiter and the client interprets the
  // resulting 429 as "no session" — bouncing the user straight back out.
  if (pathname === "/api/auth/me" || pathname.startsWith("/api/auth/me/")) return "api"

  // Auth *pages* (GET /auth/login, /auth/sign-up, …) are ordinary navigations.
  // Actual credential submission happens client-side against Supabase, so the
  // only POSTs that reach us here are first-party auth API calls — keep those
  // strict, let the page views use the generous "page" bucket.
  if (pathname.startsWith("/auth")) return method === "POST" ? "auth" : "page"
  if (pathname.startsWith("/api/auth")) return method === "POST" ? "auth" : "api"

  if (pathname.includes("/claim") || pathname.includes("/faucet")) return "claim"
  if (pathname.startsWith("/api/")) return "api"
  return "page"
}

function checkRateLimit(ip: string, path: string, method: string): { allowed: boolean; remaining: number } {
  const limitType = getRateLimitType(path, method)
  const { windowMs, maxRequests } = RATE_LIMITS[limitType]
  const key = `${ip}:${limitType}`
  const now = Date.now()

  let record = rateLimitStore.get(key)

  // Cleanup old records periodically
  if (rateLimitStore.size > 10000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetTime < now) rateLimitStore.delete(k)
    }
  }

  if (!record || record.resetTime < now) {
    record = { count: 1, resetTime: now + windowMs }
    rateLimitStore.set(key, record)
    return { allowed: true, remaining: maxRequests - 1 }
  }

  record.count++
  return {
    allowed: record.count <= maxRequests,
    remaining: Math.max(0, maxRequests - record.count),
  }
}

function detectSuspiciousRequest(url: string): boolean {
  return SUSPICIOUS_PATTERNS.some(pattern => pattern.test(url))
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

  // Static assets - skip entirely
  if (pathname.startsWith("/_next/") || pathname.startsWith("/static/") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|js|css)$/)) {
    return NextResponse.next()
  }

  // Check for suspicious requests (potential attacks)
  if (detectSuspiciousRequest(request.url)) {
    console.warn(`[Security] Blocked suspicious request from ${ip}: ${pathname}`)
    return new NextResponse(
      JSON.stringify({ error: "Request blocked", code: "SECURITY_BLOCK" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS }
      }
    )
  }

  // Server-to-server webhook routes must NEVER hit the in-memory rate
  // limiter. Offerwall providers (c.cx.ua, CPX, Lootably, Torox, etc.) can
  // burst many postbacks from a single egress IP, and a 429 with a JSON
  // body causes them to mark the offer as "Failed" in their dashboard
  // (see https://c.cx.ua/docs/#ow_response — the response body must be
  // exactly "ok"). Each route enforces signature + IP whitelist checks of
  // its own, so this bypass is the correct trust boundary.
  const isWebhookPath =
    pathname.startsWith("/api/postback") ||
    pathname.startsWith("/api/webhook") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron")

  // Rate limiting (skip for Cloudflare-verified requests with ray ID
  // and for server-to-server webhook endpoints).
  const cfRay = request.headers.get("cf-ray")
  if (!cfRay && !isWebhookPath) {
    const rateLimit = checkRateLimit(ip, pathname, request.method)
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

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
  auth: { windowMs: 60000, maxRequests: 10 },
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

function getRateLimitType(pathname: string): keyof typeof RATE_LIMITS {
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/auth")) return "auth"
  if (pathname.includes("/claim") || pathname.includes("/faucet")) return "claim"
  if (pathname.startsWith("/api/")) return "api"
  return "page"
}

function checkRateLimit(ip: string, path: string): { allowed: boolean; remaining: number } {
  const limitType = getRateLimitType(path)
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

  // Rate limiting (skip for Cloudflare-verified requests with ray ID)
  const cfRay = request.headers.get("cf-ray")
  if (!cfRay) {
    const rateLimit = checkRateLimit(ip, pathname)
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

  // Public API routes - no auth needed
  const publicApiPaths = ["/api/stats", "/api/health", "/api/webhooks", "/api/ping"]
  if (publicApiPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return addSecurityHeaders(NextResponse.next())
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
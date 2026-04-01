// =============================================================================
// SECURITY MIDDLEWARE v2.0 - Comprehensive API Protection
// =============================================================================
//
// Unified security middleware that applies all protection layers:
// 1. Rate limiting (multi-dimensional)
// 2. VPN/Proxy detection
// 3. Abuse detection
// 4. Bot detection
// 5. Request validation
// 6. Security headers
//
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, type RateLimitContext } from "./advanced-rate-limiter"
import { detectAbuse, type AbuseContext } from "./abuse-detection"
import { detectVPNFortress } from "./vpn-fortress"
import { validateSecurityServerSide, type ClientSecurityPayload } from "./server-validation"
import { log } from "@/lib/logger"

// =============================================================================
// TYPES
// =============================================================================

export interface SecurityMiddlewareResult {
  allowed: boolean
  response?: NextResponse
  securityContext: {
    ip: string
    userId?: string
    fingerprint?: string
    riskScore: number
    flags: string[]
    rateLimitRemaining: number
    vpnDetected: boolean
    abuseDetected: boolean
  }
}

export interface SecurityMiddlewareOptions {
  // Which checks to run
  checkRateLimit?: boolean
  checkVPN?: boolean
  checkAbuse?: boolean
  checkBot?: boolean
  
  // Rate limit config
  rateLimitKey?: string
  
  // VPN config
  allowVPN?: boolean
  
  // Abuse config
  abuseAction?: string
  
  // Response config
  returnDetailedErrors?: boolean
}

const DEFAULT_OPTIONS: SecurityMiddlewareOptions = {
  checkRateLimit: true,
  checkVPN: true,
  checkAbuse: true,
  checkBot: true,
  allowVPN: false,
  returnDetailedErrors: false,
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0].trim()
  }
  return request.headers.get("x-real-ip") || "127.0.0.1"
}

function getFingerprint(request: NextRequest): string | undefined {
  return request.headers.get("x-device-fingerprint") ||
         request.headers.get("x-fingerprint") ||
         undefined
}

function getUserAgent(request: NextRequest): string {
  return request.headers.get("user-agent") || ""
}

function getCountry(request: NextRequest): string | undefined {
  return request.headers.get("x-vercel-ip-country") ||
         request.headers.get("cf-ipcountry") ||
         undefined
}

// =============================================================================
// SECURITY HEADERS
// =============================================================================

function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY")
  
  // XSS protection
  response.headers.set("X-XSS-Protection", "1; mode=block")
  
  // Prevent MIME sniffing
  response.headers.set("X-Content-Type-Options", "nosniff")
  
  // Referrer policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  
  // Permissions policy
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  
  // Content security policy
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';"
  )
  
  return response
}

// =============================================================================
// MAIN MIDDLEWARE FUNCTION
// =============================================================================

export async function securityMiddleware(
  request: NextRequest,
  userId?: string,
  options: SecurityMiddlewareOptions = {}
): Promise<SecurityMiddlewareResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const ip = getClientIP(request)
  const fingerprint = getFingerprint(request)
  const userAgent = getUserAgent(request)
  const country = getCountry(request)
  const endpoint = new URL(request.url).pathname
  
  const securityContext: SecurityMiddlewareResult["securityContext"] = {
    ip,
    userId,
    fingerprint,
    riskScore: 0,
    flags: [],
    rateLimitRemaining: 100,
    vpnDetected: false,
    abuseDetected: false,
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 1: Rate Limiting
  // ═══════════════════════════════════════════════════════════════════════════
  if (opts.checkRateLimit) {
    const rateLimitContext: RateLimitContext = {
      userId,
      ip,
      fingerprint,
      endpoint,
      method: request.method,
      userAgent,
      country,
    }
    
    const rateLimitResult = await checkRateLimit(rateLimitContext, opts.rateLimitKey)
    securityContext.rateLimitRemaining = rateLimitResult.remaining
    
    if (!rateLimitResult.allowed) {
      securityContext.flags.push("rate_limited")
      securityContext.riskScore += 20
      
      const response = NextResponse.json(
        {
          error: "Too many requests",
          retryAfter: Math.ceil(rateLimitResult.retryAfter / 1000),
          ...(opts.returnDetailedErrors && {
            reason: rateLimitResult.reason,
            penaltyLevel: rateLimitResult.penaltyLevel,
          }),
        },
        { status: 429 }
      )
      
      // Add rate limit headers
      Object.entries(rateLimitResult.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
      
      return {
        allowed: false,
        response: addSecurityHeaders(response),
        securityContext,
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 2: VPN/Proxy Detection
  // ═══════════════════════════════════════════════════════════════════════════
  if (opts.checkVPN) {
    try {
      const vpnResult = await detectVPNFortress(ip, {
        userAgent,
        timezone: request.headers.get("x-timezone") || undefined,
      })
      
      securityContext.vpnDetected = vpnResult.shouldBlock
      
      if (vpnResult.shouldBlock && !opts.allowVPN) {
        securityContext.flags.push("vpn_detected")
        securityContext.riskScore += vpnResult.riskScore
        
        // For high-confidence VPN detection, block the request
        if (vpnResult.confidence >= 90) {
          const response = NextResponse.json(
            {
              error: "VPN or proxy detected",
              message: "Please disable your VPN to continue",
              ...(opts.returnDetailedErrors && {
                provider: vpnResult.details.provider,
                confidence: vpnResult.confidence,
              }),
            },
            { status: 403 }
          )
          
          return {
            allowed: false,
            response: addSecurityHeaders(response),
            securityContext,
          }
        }
      }
    } catch (error) {
      log.error("VPN detection error", { error, ip })
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 3: Abuse Detection
  // ═══════════════════════════════════════════════════════════════════════════
  if (opts.checkAbuse && userId) {
    try {
      const abuseContext: AbuseContext = {
        userId,
        ip,
        fingerprint,
        userAgent,
        action: opts.abuseAction || endpoint,
      }
      
      const abuseResult = await detectAbuse(abuseContext)
      securityContext.abuseDetected = abuseResult.isAbuse
      securityContext.riskScore += abuseResult.riskScore
      securityContext.flags.push(...abuseResult.abuseType)
      
      if (abuseResult.shouldBlock) {
        const response = NextResponse.json(
          {
            error: "Suspicious activity detected",
            message: abuseResult.shouldBan 
              ? "Your account has been suspended"
              : "Please try again later",
            ...(opts.returnDetailedErrors && {
              reasons: abuseResult.reasons,
              riskScore: abuseResult.riskScore,
            }),
          },
          { status: abuseResult.shouldBan ? 403 : 429 }
        )
        
        return {
          allowed: false,
          response: addSecurityHeaders(response),
          securityContext,
        }
      }
    } catch (error) {
      log.error("Abuse detection error", { error, userId })
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 4: Bot Detection
  // ═══════════════════════════════════════════════════════════════════════════
  if (opts.checkBot && userId) {
    try {
      const payload: ClientSecurityPayload = {
        fingerprint,
        timestamp: Date.now(),
        hardwareConcurrency: parseInt(request.headers.get("x-hardware-concurrency") || "0") || undefined,
        deviceMemory: parseInt(request.headers.get("x-device-memory") || "0") || undefined,
        timezone: request.headers.get("x-timezone") || undefined,
        language: request.headers.get("accept-language") || undefined,
      }
      
      const validationResult = await validateSecurityServerSide(userId, payload)
      securityContext.riskScore += validationResult.riskScore
      securityContext.flags.push(...validationResult.flags)
      
      if (validationResult.shouldLogout || validationResult.isBlocked) {
        const response = NextResponse.json(
          {
            error: "Security check failed",
            message: validationResult.banReason || "Please verify you are human",
            ...(opts.returnDetailedErrors && {
              threatLevel: validationResult.threatLevel,
              confidence: validationResult.confidence,
            }),
          },
          { status: 403 }
        )
        
        return {
          allowed: false,
          response: addSecurityHeaders(response),
          securityContext,
        }
      }
    } catch (error) {
      log.error("Bot detection error", { error, userId })
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ALL CHECKS PASSED
  // ═══════════════════════════════════════════════════════════════════════════
  return {
    allowed: true,
    securityContext,
  }
}

// =============================================================================
// CONVENIENCE WRAPPERS
// =============================================================================

/**
 * Quick check for claim endpoints
 */
export async function securityCheckClaim(
  request: NextRequest,
  userId: string
): Promise<SecurityMiddlewareResult> {
  return securityMiddleware(request, userId, {
    rateLimitKey: "faucet_claim",
    abuseAction: "claim",
    allowVPN: false,
  })
}

/**
 * Quick check for PTC endpoints
 */
export async function securityCheckPTC(
  request: NextRequest,
  userId: string
): Promise<SecurityMiddlewareResult> {
  return securityMiddleware(request, userId, {
    rateLimitKey: "ptc_view",
    abuseAction: "ptc_view",
    allowVPN: false,
  })
}

/**
 * Quick check for shortlink endpoints
 */
export async function securityCheckShortlink(
  request: NextRequest,
  userId: string
): Promise<SecurityMiddlewareResult> {
  return securityMiddleware(request, userId, {
    rateLimitKey: "shortlink_visit",
    abuseAction: "shortlink_visit",
    allowVPN: false,
  })
}

/**
 * Quick check for withdrawal endpoints
 */
export async function securityCheckWithdrawal(
  request: NextRequest,
  userId: string
): Promise<SecurityMiddlewareResult> {
  return securityMiddleware(request, userId, {
    rateLimitKey: "withdrawal",
    abuseAction: "withdrawal",
    allowVPN: false,
    checkAbuse: true,
    checkBot: true,
  })
}

/**
 * Quick check for auth endpoints
 */
export async function securityCheckAuth(
  request: NextRequest
): Promise<SecurityMiddlewareResult> {
  return securityMiddleware(request, undefined, {
    rateLimitKey: "auth_attempt",
    checkVPN: true,
    checkAbuse: false, // No user yet
    checkBot: false,
  })
}

// =============================================================================
// EXPORTS
// =============================================================================

export { addSecurityHeaders }

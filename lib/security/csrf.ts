// =====================================================
// CSRF Protection
// =====================================================

import { cookies } from "next/headers"
import { generateSignedCSRFToken, validateSignedCSRFToken } from "@/lib/security/csrf-token"

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.SUPABASE_JWT_SECRET
const CSRF_COOKIE_NAME = "__csrf"
const CSRF_HEADER_NAME = "x-csrf-token"

function requireCsrfSecret(): string {
  // No predictable development fallback: missing/weak secret must fail the
  // token operation rather than silently weakening CSRF protection.
  if (!CSRF_SECRET || Buffer.byteLength(CSRF_SECRET, "utf8") < 32) {
    throw new Error("Set CSRF_SECRET (recommended) or SUPABASE_JWT_SECRET to at least 32 UTF-8 bytes")
  }
  return CSRF_SECRET
}

export async function generateCSRFToken(): Promise<string> {
  return generateSignedCSRFToken(requireCsrfSecret())
}

export async function validateCSRFToken(token: string | null): Promise<boolean> {
  if (!CSRF_SECRET || Buffer.byteLength(CSRF_SECRET, "utf8") < 32) return false
  return validateSignedCSRFToken(token, CSRF_SECRET)
}

export async function setCSRFCookie(): Promise<string> {
  const token = await generateCSRFToken()
  const cookieStore = await cookies()

  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 3600, // 1 hour
  })

  return token
}

export async function getCSRFFromCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(CSRF_COOKIE_NAME)?.value || null
}

export async function verifyCSRFFromRequest(request: Request): Promise<boolean> {
  const headerToken = request.headers.get(CSRF_HEADER_NAME)
  const cookieToken = await getCSRFFromCookie()

  if (!headerToken || !cookieToken) return false

  // Header must match the cookie AND the token must still be valid (signature
  // + expiry). The cookie is SameSite=Strict + httpOnly, so a cross-site
  // attacker can neither read nor forge it — but same-site XSS can read the
  // header value out of JS memory only if it also obtained the cookie, which
  // requires httpOnly bypass. Belt and suspenders: both must be present and
  // cryptographically valid.
  return headerToken === cookieToken && (await validateCSRFToken(cookieToken))
}

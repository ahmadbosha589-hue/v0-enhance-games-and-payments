// =====================================================
// CSRF Protection
// =====================================================

import { cookies } from "next/headers"
import { randomBytes, createHmac } from "crypto"

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.SUPABASE_JWT_SECRET || "fallback-secret-change-me"
const CSRF_COOKIE_NAME = "__csrf"
const CSRF_HEADER_NAME = "x-csrf-token"

export async function generateCSRFToken(): Promise<string> {
  const token = randomBytes(32).toString("hex")
  const timestamp = Date.now().toString()
  const signature = createHmac("sha256", CSRF_SECRET).update(`${token}:${timestamp}`).digest("hex")

  return `${token}:${timestamp}:${signature}`
}

export async function validateCSRFToken(token: string | null): Promise<boolean> {
  if (!token) return false

  const parts = token.split(":")
  if (parts.length !== 3) return false

  const [tokenValue, timestamp, signature] = parts

  // Check timestamp (valid for 1 hour)
  const tokenTime = Number.parseInt(timestamp, 10)
  if (isNaN(tokenTime) || Date.now() - tokenTime > 3600000) {
    return false
  }

  // Verify signature
  const expectedSignature = createHmac("sha256", CSRF_SECRET).update(`${tokenValue}:${timestamp}`).digest("hex")

  return signature === expectedSignature
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

  return headerToken === cookieToken && (await validateCSRFToken(cookieToken))
}

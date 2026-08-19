import { createHmac } from "node:crypto"

export function getRequestIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
}

export function getViewerHash(request: Request, day = new Date().toISOString().slice(0, 10)): string | null {
  const secret = process.env.VIEWER_HASH_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return null

  const ip = getRequestIp(request)
  const userAgent = request.headers.get("user-agent") || "unknown"
  return createHmac("sha256", secret)
    .update(`${day}\n${ip}\n${userAgent}`)
    .digest("hex")
}

export function getDeviceClass(userAgent: string | null): "mobile" | "tablet" | "desktop" {
  const value = (userAgent || "").toLowerCase()
  if (/ipad|tablet|kindle|playbook|silk/.test(value)) return "tablet"
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/.test(value)) return "mobile"
  return "desktop"
}

export function getConsentMarketing(request: Request): boolean {
  const raw = request.headers.get("cookie")?.match(/(?:^|;\s*)cc_consent=([^;]*)/)?.[1]
  if (!raw) return false

  try {
    const state = JSON.parse(decodeURIComponent(raw)) as { marketing?: boolean; decidedAt?: string; v?: number }
    return state.v === 1 && state.marketing === true && typeof state.decidedAt === "string"
  } catch {
    return false
  }
}

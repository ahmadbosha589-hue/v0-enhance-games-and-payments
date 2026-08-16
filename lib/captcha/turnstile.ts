// =====================================================
// Cloudflare Turnstile CAPTCHA Integration
// =====================================================

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export interface TurnstileVerifyResult {
  success: boolean
  errorCodes?: string[]
  challengeTs?: string
  hostname?: string
  action?: string
  cdata?: string
}

export async function verifyTurnstileToken(token: string, ip?: string): Promise<TurnstileVerifyResult> {
  if (!TURNSTILE_SECRET) {
    // If no secret configured, skip verification (development mode)
    console.warn("[Turnstile] No secret key configured, skipping verification")
    return { success: true }
  }

  try {
    const formData = new URLSearchParams()
    formData.append("secret", TURNSTILE_SECRET)
    formData.append("response", token)
    if (ip) formData.append("remoteip", ip)

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    })

    const data = await response.json()

    return {
      success: data.success,
      errorCodes: data["error-codes"],
      challengeTs: data.challenge_ts,
      hostname: data.hostname,
      action: data.action,
      cdata: data.cdata,
    }
  } catch (error) {
    console.error("[Turnstile] Verification error:", error)
    return { success: false, errorCodes: ["internal-error"] }
  }
}

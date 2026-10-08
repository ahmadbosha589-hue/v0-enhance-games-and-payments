import { NextResponse } from "next/server"
import { getVerifiedUser } from "@/lib/supabase/server"
import { generateCSRFToken, setCSRFCookie, getCSRFFromCookie, validateCSRFToken } from "@/lib/security/csrf"

export const dynamic = "force-dynamic"

/**
 * CSRF token issuance.
 *
 * Double-submit pattern: the client cannot read the httpOnly `__csrf` cookie,
 * so this endpoint returns the SAME token in the JSON body for the client to
 * echo back as the `x-csrf-token` header on mutating requests.
 * verifyCSRFFromRequest() then requires header == cookie AND a valid HMAC.
 *
 * Auth-gated: issuing a token to anonymous browsers would let a CSRF attacker
 * pre-seed their own cookie (login-CSRF), so we only issue to live-verified
 * sessions.
 *
 * Reuse: if the existing cookie token is still valid (signature + 1h TTL),
 * return it as-is instead of rotating — avoids invalidating a token another
 * in-flight request on the same session is already using.
 */
export async function GET() {
  const user = await getVerifiedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const existing = await getCSRFFromCookie()
  if (existing && (await validateCSRFToken(existing))) {
    return NextResponse.json({ token: existing })
  }

  const token = await setCSRFCookie()
  return NextResponse.json({ token })
}

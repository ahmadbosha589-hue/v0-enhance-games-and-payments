import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { cookies, headers } from "next/headers"

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createClient()
  const headersList = await headers()
  
  // Get client IP for fraud detection later
  const clientIP =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    headersList.get("cf-connecting-ip") ||
    "unknown"

  // Normalize referral code (uppercase, trim)
  const normalizedCode = code.toUpperCase().trim()
  
  // Validate code format (prevent injection)
  if (!/^[A-Z0-9]{6,12}$/.test(normalizedCode)) {
    redirect("/auth/sign-up?error=invalid_referral")
  }

  // Verify referral code exists and is valid
  const { data: referrer } = await supabase
    .from("profiles")
    .select("id, referral_code, status, is_banned, fraud_score, referral_blocked_count")
    .eq("referral_code", normalizedCode)
    .single()

  if (!referrer) {
    // Invalid code - redirect without setting cookie
    redirect("/auth/sign-up?error=invalid_referral")
  }
  
  // Check if referrer is banned or suspended
  if (referrer.is_banned || referrer.status === "banned" || referrer.status === "suspended") {
    redirect("/auth/sign-up?error=referrer_suspended")
  }
  
  // Check if referrer has high fraud score (likely a bot)
  if (referrer.fraud_score >= 70) {
    redirect("/auth/sign-up?error=referrer_flagged")
  }
  
  // Check if referrer has too many blocked referrals (abuse pattern)
  if (referrer.referral_blocked_count >= 5) {
    redirect("/auth/sign-up?error=referrer_abuse")
  }
  
  // Store referral data in secure HTTP-only cookie
  const cookieStore = await cookies()
  
  // Set the referral code
  cookieStore.set("referral_code", normalizedCode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  })
  
  // Store referrer ID for faster lookup
  cookieStore.set("referrer_id", referrer.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  })
  
  // Store the IP at referral click time (for fraud detection)
  if (clientIP !== "unknown") {
    cookieStore.set("ref_click_ip", clientIP, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    })
  }
  
  // Store timestamp of referral click
  cookieStore.set("ref_click_time", Date.now().toString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  })
  
  // Log referral click (non-blocking)
  supabase
    .from("referral_clicks")
    .insert({
      referral_code: normalizedCode,
      referrer_id: referrer.id,
      ip_address: clientIP !== "unknown" ? clientIP : null,
      user_agent: headersList.get("user-agent"),
      clicked_at: new Date().toISOString(),
    })
    .then(() => {})
    .catch(() => {})

  redirect("/auth/sign-up")
}

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { verifyFaucetPayEmail, isFaucetPayConfiguredAsync, FaucetPayError } from "@/lib/faucetpay/client"
import { log } from "@/lib/logger"
import { requireAdminClient } from "@/lib/supabase/admin-client"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== "string") {
      return NextResponse.json({ success: false, error: "Valid email is required" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ success: false, error: "Invalid email format" }, { status: 400 })
    }

    const adminSupabase = requireAdminClient()
    const normalizedEmail = email.trim().toLowerCase()

    // Fail closed: without an API key there is no way to verify against the
    // FaucetPay API, so refuse instead of simulating success.
    if (!(await isFaucetPayConfiguredAsync())) {
      log.warn("FaucetPay verification attempted while unconfigured", { userId: user.id })
      return NextResponse.json(
        { success: false, error: "FaucetPay verification is not configured" },
        { status: 503 },
      )
    }

    // Verify with FaucetPay API
    const verification = await verifyFaucetPayEmail(normalizedEmail)

    if (verification.valid) {
      // Update profile with verified FaucetPay email
      const { error } = await adminSupabase
        .from("profiles")
        .update({
          faucetpay_email: normalizedEmail,
          faucetpay_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      if (error) {
        log.error("Failed to update profile with verified FaucetPay email", { error, userId: user.id })
        return NextResponse.json({ success: false, error: "Failed to update profile" }, { status: 500 })
      }

      log.info("FaucetPay email verified", { userId: user.id, email: normalizedEmail.substring(0, 5) + "..." })

      return NextResponse.json({
        success: true,
        verified: true,
        message: "FaucetPay account verified successfully!",
      })
    } else {
      if (verification.error === "not_configured") {
        // FaucetPay became unconfigured mid-request - do not touch the profile.
        log.error("FaucetPay became unconfigured during email verification", { userId: user.id })
        return NextResponse.json(
          { success: false, error: "FaucetPay verification is not configured" },
          { status: 503 },
        )
      }

      // Verification failed - still save the email but mark as unverified
      await adminSupabase
        .from("profiles")
        .update({
          faucetpay_email: normalizedEmail,
          faucetpay_verified: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      return NextResponse.json({
        success: false,
        verified: false,
        error: verification.error || "This email is not registered on FaucetPay. Please create a FaucetPay account first.",
      })
    }
  } catch (error) {
    log.error("FaucetPay verification error", { error })

    if (error instanceof FaucetPayError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode === 408 ? 504 : 400 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: "Verification failed. Please try again later.",
      },
      { status: 500 },
    )
  }
}

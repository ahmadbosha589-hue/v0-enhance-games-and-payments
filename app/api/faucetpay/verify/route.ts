import { type NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { verifyFaucetPayEmail, isFaucetPayConfigured, FaucetPayError } from "@/lib/faucetpay/client"
import { log } from "@/lib/logger"

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

    const adminSupabase = createAdminClient()
    const normalizedEmail = email.trim().toLowerCase()

    // Check if FaucetPay API key is configured
    if (!isFaucetPayConfigured()) {
      // Development mode - save without verification
      const { error } = await adminSupabase
        .from("profiles")
        .update({
          faucetpay_email: normalizedEmail,
          faucetpay_verified: true, // Auto-verify in dev mode
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      if (error) {
        log.error("Failed to save FaucetPay email (dev mode)", { error, userId: user.id })
        return NextResponse.json({ success: false, error: "Failed to save email" }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        verified: true,
        message: "Email saved and verified (development mode - FAUCETPAY_API_KEY not set)",
      })
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

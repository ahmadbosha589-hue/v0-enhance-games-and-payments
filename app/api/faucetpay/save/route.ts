import { type NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { verifyFaucetPayEmail, isFaucetPayConfigured } from "@/lib/faucetpay/client"
import { log } from "@/lib/logger"

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized - please log in" }, { status: 401 })
    }

    // Parse the request body
    const body = await request.json()
    const { email, skipVerification } = body

    if (!email || typeof email !== "string") {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const normalizedEmail = email.trim().toLowerCase()

    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ success: false, error: "Invalid email format" }, { status: 400 })
    }

    // Use admin client to bypass RLS
    const adminSupabase = createAdminClient()

    // Try to verify with FaucetPay if API is configured and not skipping verification
    let isVerified = false
    let verificationError: string | undefined

    if (isFaucetPayConfigured() && !skipVerification) {
      const verification = await verifyFaucetPayEmail(normalizedEmail)
      isVerified = verification.valid
      verificationError = verification.error
    } else if (!isFaucetPayConfigured()) {
      // Auto-verify in development mode
      isVerified = true
    }

    // Update the profile with the new FaucetPay email
    const { data, error } = await adminSupabase
      .from("profiles")
      .update({
        faucetpay_email: normalizedEmail,
        faucetpay_verified: isVerified,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("faucetpay_email, faucetpay_verified")
      .single()

    if (error) {
      log.error("Failed to save FaucetPay email", { error, userId: user.id })
      return NextResponse.json({ success: false, error: "Failed to save email. Please try again." }, { status: 500 })
    }

    log.info("FaucetPay email saved", {
      userId: user.id,
      verified: isVerified,
      email: normalizedEmail.substring(0, 5) + "..."
    })

    return NextResponse.json({
      success: true,
      message: isVerified
        ? "FaucetPay email saved and verified successfully!"
        : "FaucetPay email saved. Please verify your account.",
      email: data?.faucetpay_email,
      verified: isVerified,
      verificationError: verificationError,
    })
  } catch (error) {
    log.error("FaucetPay save error", { error })
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred. Please try again." },
      { status: 500 },
    )
  }
}

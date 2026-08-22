import { type NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { verifyFaucetPayEmail, isFaucetPayConfiguredAsync } from "@/lib/faucetpay/client"
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
    let body: { email?: string; skipVerification?: boolean }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 })
    }

    const { email, skipVerification } = body

    if (!email || typeof email !== "string") {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 })
    }

    // Validate and normalize email
    const normalizedEmail = email.trim().toLowerCase()

    // More comprehensive email validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ success: false, error: "Invalid email format" }, { status: 400 })
    }

    // Check email length
    if (normalizedEmail.length > 254) {
      return NextResponse.json({ success: false, error: "Email address too long" }, { status: 400 })
    }

    // Use admin client to bypass RLS
    const adminSupabase = createAdminClient()

    if (!adminSupabase) {
      log.error("Failed to create admin Supabase client")
      return NextResponse.json({ success: false, error: "Service unavailable" }, { status: 503 })
    }

    // Check if email is already used by another user
    const { data: existingUser, error: checkError } = await adminSupabase
      .from("profiles")
      .select("id")
      .eq("faucetpay_email", normalizedEmail)
      .neq("id", user.id)
      .maybeSingle()

    if (checkError) {
      log.error("Error checking existing FaucetPay email", { error: checkError })
    } else if (existingUser) {
      return NextResponse.json({
        success: false,
        error: "This FaucetPay email is already linked to another account"
      }, { status: 400 })
    }

    // Verification is required before any payout. Saving an email is not proof
    // that the FaucetPay account can receive funds.
    let isVerified = false
    let verificationError: string | undefined

    if ((await isFaucetPayConfiguredAsync()) && !skipVerification) {
      try {
        const verification = await verifyFaucetPayEmail(normalizedEmail)
        isVerified = verification.valid
        if (!verification.valid) verificationError = verification.error
      } catch (verifyErr) {
        log.warn("FaucetPay verification failed", { error: verifyErr })
        verificationError = "Verification service temporarily unavailable"
      }
    } else if (skipVerification) {
      verificationError = "Verification is required before payouts"
    } else {
      verificationError = "FaucetPay verification is not configured"
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

      // Provide more specific error messages
      if (error.code === "23505") {
        return NextResponse.json({ success: false, error: "This email is already in use" }, { status: 400 })
      }

      return NextResponse.json({ success: false, error: "Failed to save email. Please try again." }, { status: 500 })
    }

    // Verify the email was actually saved
    if (!data?.faucetpay_email) {
      log.error("FaucetPay email not returned after save", { userId: user.id })
      return NextResponse.json({
        success: false,
        error: "Failed to confirm email was saved. Please refresh and try again."
      }, { status: 500 })
    }

    log.info("FaucetPay email saved successfully", {
      userId: user.id,
      verified: isVerified,
      email: normalizedEmail.substring(0, 5) + "***"
    })

    return NextResponse.json({
      success: true,
      message: isVerified
        ? "FaucetPay email saved and verified successfully!"
        : "FaucetPay email saved but not verified. Payouts remain disabled until verification succeeds.",
      email: data.faucetpay_email,
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

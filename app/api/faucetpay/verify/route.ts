import { type NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

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
    const apiKey = process.env.FAUCETPAY_API_KEY

    if (!apiKey) {
      const { error } = await adminSupabase
        .from("profiles")
        .update({
          faucetpay_email: normalizedEmail,
          faucetpay_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      if (error) {
        return NextResponse.json({ success: false, error: "Failed to save email" }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        verified: true,
        message: "Email saved and verified (development mode)",
      })
    }

    try {
      const params = new URLSearchParams()
      params.append("api_key", apiKey)
      params.append("address", normalizedEmail)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

      const response = await fetch("https://faucetpay.io/api/v1/checkaddress", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const result = await response.json()

      if (result.status === 200 && result.payout_user_hash) {
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
          return NextResponse.json({ success: false, error: "Failed to update profile" }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          verified: true,
          message: "FaucetPay account verified successfully!",
        })
      } else if (result.status === 456) {
        // Address not found
        return NextResponse.json({
          success: false,
          verified: false,
          error:
            "This email is not registered on FaucetPay. Please create a FaucetPay account first or check your email address.",
        })
      } else {
        // Other error
        return NextResponse.json({
          success: false,
          verified: false,
          error: result.message || "Could not verify FaucetPay account. Please try again.",
        })
      }
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json(
          {
            success: false,
            error: "FaucetPay verification timed out. Please try again.",
          },
          { status: 504 },
        )
      }
      throw fetchError
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Verification failed. Please try again later.",
      },
      { status: 500 },
    )
  }
}

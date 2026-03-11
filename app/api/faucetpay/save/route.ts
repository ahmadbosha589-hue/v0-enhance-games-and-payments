import { type NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

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
    const { email } = body

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

    // Update the profile with the new FaucetPay email
    const { data, error } = await adminSupabase
      .from("profiles")
      .update({
        faucetpay_email: normalizedEmail,
        faucetpay_verified: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("faucetpay_email")
      .single()

    if (error) {
      console.error("Failed to save FaucetPay email:", error)
      return NextResponse.json({ success: false, error: "Failed to save email. Please try again." }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "FaucetPay email saved successfully",
      email: data?.faucetpay_email,
    })
  } catch (error) {
    console.error("FaucetPay save error:", error)
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred. Please try again." },
      { status: 500 },
    )
  }
}

import { createClient } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { NextResponse } from "next/server"
import { verifyTOTP } from "@/lib/2fa/totp"

export async function POST(request: Request) {
  try {
    const adminDb = requireAdminClient()
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { code } = await request.json()

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json({ error: "Invalid code format" }, { status: 400 })
    }

    // Get user's 2FA secret
    const { data: profile } = await supabase
      .from("profiles")
      .select("two_factor_secret, two_factor_enabled")
      .eq("id", user.id)
      .single()

    if (!profile?.two_factor_secret) {
      return NextResponse.json({ error: "2FA not setup" }, { status: 400 })
    }

    // Verify the code
    const isValid = verifyTOTP(profile.two_factor_secret, code)

    if (!isValid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 })
    }

    // If this is the initial verification (enabling 2FA)
    if (!profile.two_factor_enabled) {
      const { error: updateError } = await adminDb
        .from("profiles")
        .update({
          two_factor_enabled: true,
          two_factor_enabled_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      if (updateError) {
        console.error("Failed to enable 2FA:", updateError)
        return NextResponse.json({ error: "Failed to enable 2FA" }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, enabled: true })
  } catch (error) {
    console.error("2FA verify error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

import { createClient } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { NextResponse } from "next/server"
import { verifyTOTP, verifyBackupCode } from "@/lib/2fa/totp"

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

    const { code, useBackupCode } = await request.json()

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Code is required" }, { status: 400 })
    }

    // Get user's 2FA data
    const { data: profile } = await supabase
      .from("profiles")
      .select("two_factor_secret, two_factor_enabled, two_factor_backup_codes")
      .eq("id", user.id)
      .single()

    if (!profile?.two_factor_enabled) {
      return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 })
    }

    let isValid = false

    if (useBackupCode) {
      // Verify using backup code
      const result = verifyBackupCode(code, profile.two_factor_backup_codes || [])
      isValid = result.valid
    } else {
      // Verify using TOTP
      isValid = verifyTOTP(profile.two_factor_secret!, code)
    }

    if (!isValid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 })
    }

    // Disable 2FA
    const { error: updateError } = await adminDb
      .from("profiles")
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_backup_codes: null,
        two_factor_enabled_at: null,
      })
      .eq("id", user.id)

    if (updateError) {
      console.error("Failed to disable 2FA:", updateError)
      return NextResponse.json({ error: "Failed to disable 2FA" }, { status: 500 })
    }

    return NextResponse.json({ success: true, enabled: false })
  } catch (error) {
    console.error("2FA disable error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

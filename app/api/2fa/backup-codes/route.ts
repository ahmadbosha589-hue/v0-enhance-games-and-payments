import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { verifyTOTP, generateBackupCodes, hashBackupCode } from "@/lib/2fa/totp"

// Regenerate backup codes
export async function POST(request: Request) {
  try {
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

    // Get user's 2FA data
    const { data: profile } = await supabase
      .from("profiles")
      .select("two_factor_secret, two_factor_enabled")
      .eq("id", user.id)
      .single()

    if (!profile?.two_factor_enabled || !profile.two_factor_secret) {
      return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 })
    }

    // Verify the current code
    const isValid = verifyTOTP(profile.two_factor_secret, code)
    if (!isValid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 })
    }

    // Generate new backup codes
    const newBackupCodes = generateBackupCodes(10)
    const hashedBackupCodes = newBackupCodes.map(hashBackupCode)

    // Update backup codes
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ two_factor_backup_codes: hashedBackupCodes })
      .eq("id", user.id)

    if (updateError) {
      console.error("Failed to regenerate backup codes:", updateError)
      return NextResponse.json({ error: "Failed to regenerate backup codes" }, { status: 500 })
    }

    return NextResponse.json({ backupCodes: newBackupCodes })
  } catch (error) {
    console.error("Backup codes regeneration error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

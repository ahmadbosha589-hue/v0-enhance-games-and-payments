import { createClient } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { NextResponse } from "next/server"
import { generateBase32Secret, generateTOTPUri, generateBackupCodes, hashBackupCode } from "@/lib/2fa/totp"

export async function POST() {
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

    // Check if 2FA is already enabled
    const { data: profile } = await supabase
      .from("profiles")
      .select("two_factor_enabled, two_factor_secret")
      .eq("id", user.id)
      .single()

    if (profile?.two_factor_enabled) {
      return NextResponse.json({ error: "2FA is already enabled" }, { status: 400 })
    }

    // Generate new secret
    const secret = generateBase32Secret(20)
    const otpauthUri = generateTOTPUri(secret, user.email || "user", "Faucero")

    // Generate backup codes
    const backupCodes = generateBackupCodes(10)
    const hashedBackupCodes = backupCodes.map(hashBackupCode)

    // Store the secret temporarily (not enabled yet)
    const { error: updateError } = await adminDb
      .from("profiles")
      .update({
        two_factor_secret: secret,
        two_factor_backup_codes: hashedBackupCodes,
      })
      .eq("id", user.id)

    if (updateError) {
      console.error("Failed to store 2FA secret:", updateError)
      return NextResponse.json({ error: "Failed to setup 2FA" }, { status: 500 })
    }

    return NextResponse.json({
      secret,
      otpauthUri,
      backupCodes, // Only returned once during setup
    })
  } catch (error) {
    console.error("2FA setup error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { verifyTOTP, verifyBackupCode } from "@/lib/2fa/totp"

// This endpoint is for validating 2FA during login
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    }

    const { userId, code, useBackupCode } = await request.json()

    if (!userId || !code) {
      return NextResponse.json({ error: "User ID and code are required" }, { status: 400 })
    }

    // Get user's 2FA data (using service role for this)
    const { data: profile } = await supabase
      .from("profiles")
      .select("two_factor_secret, two_factor_enabled, two_factor_backup_codes")
      .eq("id", userId)
      .single()

    if (!profile?.two_factor_enabled || !profile.two_factor_secret) {
      return NextResponse.json({ error: "2FA not enabled for this user" }, { status: 400 })
    }

    let isValid = false
    let usedBackupCodeIndex = -1

    if (useBackupCode) {
      const result = verifyBackupCode(code, profile.two_factor_backup_codes || [])
      isValid = result.valid
      usedBackupCodeIndex = result.index
    } else {
      isValid = verifyTOTP(profile.two_factor_secret, code)
    }

    if (!isValid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 })
    }

    // If backup code was used, remove it from the list
    if (useBackupCode && usedBackupCodeIndex !== -1) {
      const updatedCodes = [...(profile.two_factor_backup_codes || [])]
      updatedCodes.splice(usedBackupCodeIndex, 1)

      await supabase.from("profiles").update({ two_factor_backup_codes: updatedCodes }).eq("id", userId)
    }

    return NextResponse.json({
      success: true,
      remainingBackupCodes: useBackupCode ? (profile.two_factor_backup_codes?.length || 0) - 1 : undefined,
    })
  } catch (error) {
    console.error("2FA validation error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

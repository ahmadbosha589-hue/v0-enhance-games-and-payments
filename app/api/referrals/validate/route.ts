import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Validate a referral code
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")

    if (!code) {
      return NextResponse.json({ valid: false, error: "No code provided" })
    }

    const supabase = await createClient()

    const { data: referrer } = await supabase
      .from("profiles")
      .select("id, display_name, referral_count, status")
      .eq("referral_code", code.toUpperCase())
      .single()

    if (!referrer) {
      return NextResponse.json({ valid: false, error: "Invalid referral code" })
    }

    if (referrer.status === "banned" || referrer.status === "suspended") {
      return NextResponse.json({ valid: false, error: "This referral code is no longer active" })
    }

    return NextResponse.json({
      valid: true,
      referrer: {
        displayName: referrer.display_name || "Anonymous",
        referralCount: referrer.referral_count,
      },
    })
  } catch (error) {
    console.error("Referral validation error:", error)
    return NextResponse.json({ valid: false, error: "Validation failed" })
  }
}

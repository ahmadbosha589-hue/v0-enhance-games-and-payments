import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("two_factor_enabled, two_factor_enabled_at, two_factor_backup_codes")
      .eq("id", user.id)
      .single()

    return NextResponse.json({
      enabled: profile?.two_factor_enabled || false,
      enabledAt: profile?.two_factor_enabled_at || null,
      backupCodesRemaining: profile?.two_factor_backup_codes?.length || 0,
    })
  } catch (error) {
    console.error("2FA status error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Check if user has 2FA enabled (for login flow)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    }

    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    // Get user by email using auth admin
    const {
      data: { users },
      error: usersError,
    } = await supabase.auth.admin.listUsers()

    if (usersError) {
      // Fallback: assume no 2FA if we can't check
      return NextResponse.json({ requires2FA: false })
    }

    const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())

    if (!user) {
      // Don't reveal if user exists
      return NextResponse.json({ requires2FA: false })
    }

    const { data: profile } = await supabase.from("profiles").select("two_factor_enabled").eq("id", user.id).single()

    return NextResponse.json({
      requires2FA: profile?.two_factor_enabled || false,
      userId: profile?.two_factor_enabled ? user.id : undefined,
    })
  } catch (error) {
    console.error("2FA check error:", error)
    return NextResponse.json({ requires2FA: false })
  }
}

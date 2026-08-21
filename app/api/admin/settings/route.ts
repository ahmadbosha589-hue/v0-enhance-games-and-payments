import { createClient } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"

const ADMIN_ROLES = ["admin", "superadmin"]

export async function POST(request: Request) {
  try {
    const adminDb = requireAdminClient()
    const supabase = await createClient()
    const headersList = await headers()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, faucetpay_email, username, display_name")
      .eq("id", user.id)
      .single()

    if (!profile || !ADMIN_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { category, updates } = body

    if (!category || !updates || typeof updates !== "object") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // Validate category
    const validCategories = ["claim", "withdrawal", "security", "referral"]
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 })
    }

    const { data: oldSettings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", Object.keys(updates))

    const oldData = oldSettings?.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {}) || {}

    const results = []
    for (const [key, value] of Object.entries(updates)) {
      const { data: upsertData, error } = await adminDb
        .from("system_settings")
        .upsert(
          {
            key,
            value: value, // Pass value directly, not JSON.stringify(value)
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          },
          { onConflict: "key" },
        )
        .select()

      if (error) {
        log.error("Failed to update setting", { key, error })
        results.push({ key, success: false, error: error.message })
      } else {
        results.push({ key, success: true })
      }
    }

    const failedUpdates = results.filter((r) => !r.success)

    if (failedUpdates.length > 0) {
      return NextResponse.json(
        {
          error: `Failed to update: ${failedUpdates.map((f) => f.key).join(", ")}`,
          details: failedUpdates,
        },
        { status: 500 },
      )
    }

    const forwarded = headersList.get("x-forwarded-for")
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : null

    await adminDb.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: profile.role,
      actor_ip: ipAddress,
      action: "update_system_settings",
      resource_type: "system_settings",
      resource_id: category,
      old_data: oldData,
      new_data: updates,
      metadata: {
        category,
        updates,
        actor_email: profile.faucetpay_email || null,
      },
    })

    log.info("System settings updated", { category, updates, admin: user.id })

    return NextResponse.json({ success: true, results })
  } catch (error) {
    log.error("Settings update error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const adminDb = requireAdminClient()
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !ADMIN_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data: settings, error } = await supabase.from("system_settings").select("*").order("category")

    if (error) {
      return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
    }

    // Group by category
    const grouped = settings.reduce(
      (acc, setting) => {
        if (!acc[setting.category]) {
          acc[setting.category] = {}
        }
        acc[setting.category][setting.key] = setting.value
        return acc
      },
      {} as Record<string, Record<string, unknown>>,
    )

    return NextResponse.json({ settings: grouped })
  } catch (error) {
    log.error("Settings fetch error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

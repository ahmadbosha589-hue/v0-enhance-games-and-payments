import { NextRequest, NextResponse } from "next/server"
import { getUser, getProfile, requireAdmin } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { encryptNetworkConfig } from "@/lib/ads/network-config-crypto"

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(["admin", "superadmin"])
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const profile = await getProfile(user.id)
    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { networkId, config, enabled } = await request.json()

    if (!networkId) {
      return NextResponse.json({ error: "Network ID required" }, { status: 400 })
    }

    const adminSupabase = requireAdminClient()

    // Encrypt the configuration
    const encryptedConfig = encryptNetworkConfig(JSON.stringify(config))

    // Upsert the configuration
    const { error } = await adminSupabase
      .from("ad_network_configs")
      .upsert({
        network_id: networkId,
        encrypted_config: encryptedConfig,
        enabled: enabled,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }, {
        onConflict: "network_id"
      })

    if (error) {
      console.error("Failed to save ad network config:", error)
      return NextResponse.json({ error: "Failed to save configuration" }, { status: 500 })
    }

    // Log admin action
    await adminSupabase.from("admin_logs").insert({
      admin_id: user.id,
      action: "configure_ad_network",
      details: { network_id: networkId, enabled },
      ip_address: request.headers.get("x-forwarded-for") || "unknown",
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Ad network config error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(["admin", "superadmin"])
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const profile = await getProfile(user.id)
    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { networkId, enabled } = await request.json()

    if (!networkId || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "networkId and enabled (boolean) required" }, { status: 400 })
    }

    const adminSupabase = requireAdminClient()

    // Flip ONLY the enabled flag. The encrypted credentials are never read,
    // decrypted, or rewritten here — the admin UI cannot even display them
    // again (they are write-only by design), so a toggle must never round-trip
    // them. A missing row means "not configured yet": refuse rather than
    // creating an empty credential-less config that would render nothing.
    const { data: existing, error: findError } = await adminSupabase
      .from("ad_network_configs")
      .select("network_id")
      .eq("network_id", networkId)
      .maybeSingle()

    if (findError) {
      console.error("Failed to look up ad network config:", findError)
      return NextResponse.json({ error: "Failed to update configuration" }, { status: 500 })
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Network is not configured yet — save its credentials first" },
        { status: 409 },
      )
    }

    const { error } = await adminSupabase
      .from("ad_network_configs")
      .update({ enabled, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq("network_id", networkId)

    if (error) {
      console.error("Failed to toggle ad network config:", error)
      return NextResponse.json({ error: "Failed to update configuration" }, { status: 500 })
    }

    await adminSupabase.from("admin_logs").insert({
      admin_id: user.id,
      action: "toggle_ad_network",
      details: { network_id: networkId, enabled },
      ip_address: request.headers.get("x-forwarded-for") || "unknown",
    })

    return NextResponse.json({ success: true, enabled })
  } catch (error) {
    console.error("Ad network toggle error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(["admin", "superadmin"])
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const profile = await getProfile(user.id)
    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const networkId = searchParams.get("networkId")

    if (!networkId) {
      return NextResponse.json({ error: "Network ID required" }, { status: 400 })
    }

    const adminSupabase = requireAdminClient()

    const { error } = await adminSupabase
      .from("ad_network_configs")
      .delete()
      .eq("network_id", networkId)

    if (error) {
      console.error("Failed to delete ad network config:", error)
      return NextResponse.json({ error: "Failed to delete configuration" }, { status: 500 })
    }

    // Log admin action
    await adminSupabase.from("admin_logs").insert({
      admin_id: user.id,
      action: "delete_ad_network",
      details: { network_id: networkId },
      ip_address: request.headers.get("x-forwarded-for") || "unknown",
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Ad network delete error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(["admin", "superadmin"])
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const profile = await getProfile(user.id)
    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const adminSupabase = requireAdminClient()

    const { data: configs, error } = await adminSupabase
      .from("ad_network_configs")
      .select("network_id, enabled, created_at, updated_at")

    if (error) {
      console.error("Failed to fetch ad network configs:", error)
      return NextResponse.json({ error: "Failed to fetch configurations" }, { status: 500 })
    }

    // Don't expose encrypted configs, just indicate they're configured
    const safeConfigs = configs?.map(c => ({
      network_id: c.network_id,
      enabled: c.enabled,
      configured: true,
      created_at: c.created_at,
      updated_at: c.updated_at,
    })) || []

    return NextResponse.json({ configs: safeConfigs })
  } catch (error) {
    console.error("Ad network fetch error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

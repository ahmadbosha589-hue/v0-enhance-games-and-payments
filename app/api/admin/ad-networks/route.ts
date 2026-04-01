import { NextRequest, NextResponse } from "next/server"
import { getUser, getProfile, createAdminClient } from "@/lib/supabase/server"
import crypto from "crypto"

// AES-256 encryption for storing sensitive credentials
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) || "default-key-must-be-32-chars!!"
const IV_LENGTH = 16

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  return iv.toString("hex") + ":" + encrypted
}

function decrypt(text: string): string {
  try {
    const [ivHex, encryptedText] = text.split(":")
    if (!ivHex || !encryptedText) return text
    const iv = Buffer.from(ivHex, "hex")
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv)
    let decrypted = decipher.update(encryptedText, "hex", "utf8")
    decrypted += decipher.final("utf8")
    return decrypted
  } catch {
    return text
  }
}

export async function POST(request: NextRequest) {
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

    const adminSupabase = createAdminClient()

    // Encrypt the configuration
    const encryptedConfig = encrypt(JSON.stringify(config))

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

export async function DELETE(request: NextRequest) {
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

    const adminSupabase = createAdminClient()

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
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const profile = await getProfile(user.id)
    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const adminSupabase = createAdminClient()

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

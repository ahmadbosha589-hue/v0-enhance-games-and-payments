import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { createAuditLog } from "@/lib/audit/logger"
import { isSafeTargetUrl } from "@/lib/ads/safe-target-url"

export const runtime = "nodejs"
export const maxDuration = 8

const reviewSchema = z.object({
  campaignId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
})

export async function GET() {
  const admin = await requireAdmin(["admin", "superadmin", "moderator", "owner"])
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const client = requireAdminClient()
    const { data, error } = await client
      .from("ad_campaigns")
      .select("id, user_id, name, network, title, description, image_url, creative_url, target_url, budget, created_at, creative_status, status")
      .eq("creative_status", "pending")
      .order("created_at", { ascending: true })
      .limit(100)

    if (error) throw error
    return NextResponse.json({ campaigns: data || [] })
  } catch (error) {
    console.error("[Advertise review] queue error:", error)
    return NextResponse.json({ error: "Failed to load review queue" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(["admin", "superadmin", "moderator", "owner"])
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = reviewSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid review request" }, { status: 400 })

  try {
    const client = requireAdminClient()
    const { data: campaign, error: campaignError } = await client
      .from("ad_campaigns")
      .select("*")
      .eq("id", parsed.data.campaignId)
      .single()

    if (campaignError || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    if (campaign.creative_status !== "pending") {
      return NextResponse.json({ error: "Campaign was already reviewed" }, { status: 409 })
    }

    if (parsed.data.action === "approve") {
      const creativeUrl = campaign.creative_url || campaign.image_url
      if (!creativeUrl || !isSafeTargetUrl(campaign.target_url)) {
        return NextResponse.json({ error: "Campaign has no approved creative or a valid target URL" }, { status: 400 })
      }

      const { error } = await client
        .from("ad_campaigns")
        .update({
          creative_url: creativeUrl,
          creative_status: "approved",
          status: "active",
          reviewed_by: admin.user.id,
          reviewed_at: new Date().toISOString(),
          review_note: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id)
        .eq("creative_status", "pending")

      if (error) throw error
      await createAuditLog({
        supabase: client,
        adminId: admin.user.id,
        adminRole: admin.profile.role,
        adminEmail: admin.user.email,
      }, {
        action: "ad_campaign_approved",
        resource_type: "ad_campaign",
        resource_id: campaign.id,
        old_data: { creative_status: "pending", status: campaign.status },
        new_data: { creative_status: "approved", status: "active" },
      })
      return NextResponse.json({ success: true, status: "active" })
    }

    const { data: refunded, error: refundError } = await client.rpc("refund_campaign", {
      p_campaign_id: campaign.id,
    })
    if (refundError) throw refundError

    const { error } = await client
      .from("ad_campaigns")
      .update({
        creative_status: "rejected",
        status: "stopped",
        reviewed_by: admin.user.id,
        reviewed_at: new Date().toISOString(),
        review_note: parsed.data.reason || "Rejected during manual review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id)
      .eq("creative_status", "pending")
    if (error) throw error

    await createAuditLog({
      supabase: client,
      adminId: admin.user.id,
      adminRole: admin.profile.role,
      adminEmail: admin.user.email,
    }, {
      action: "ad_campaign_rejected",
      resource_type: "ad_campaign",
      resource_id: campaign.id,
      old_data: { creative_status: "pending", status: campaign.status },
      new_data: { creative_status: "rejected", status: "stopped", refund: refunded || 0 },
      metadata: { reason: parsed.data.reason || "Rejected during manual review" },
    })

    return NextResponse.json({ success: true, status: "rejected", refunded: refunded || 0 })
  } catch (error) {
    console.error("[Advertise review] action error:", error)
    return NextResponse.json({ error: "Review action failed" }, { status: 500 })
  }
}

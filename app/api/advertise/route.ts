import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { log } from "@/lib/logger"
import { z } from "zod"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { isSafeTargetUrl } from "@/lib/ads/safe-target-url"
import { validateCreativeUrl } from "@/lib/ads/campaign-contract"

// Ad Networks supported
const AD_NETWORKS = {
  "google-ads": { name: "Google Ads", minBudget: 10, cpm: 2.5 },
  "facebook-ads": { name: "Facebook Ads", minBudget: 5, cpm: 3.0 },
  "tiktok-ads": { name: "TikTok Ads", minBudget: 20, cpm: 2.0 },
  "twitter-ads": { name: "Twitter/X Ads", minBudget: 10, cpm: 4.0 },
  "banner-network": { name: "Banner Network", minBudget: 5, cpm: 1.5 },
  "native-ads": { name: "Native Ads", minBudget: 10, cpm: 2.8 },
  "push-notifications": { name: "Push Notifications", minBudget: 5, cpm: 0.5 },
  "popup-ads": { name: "Popup Ads", minBudget: 5, cpm: 1.0 },
  "crypto-ads": { name: "Crypto Ad Inventory (first-party review required)", minBudget: 25, cpm: 2.0 },
}

const DEFAULT_TARGETING = {
  countries: [] as string[],
  devices: ["desktop", "mobile", "tablet"] as ("desktop" | "mobile" | "tablet")[],
  os: [] as string[],
  languages: [] as string[],
}

const targetingSchema = z.object({
  countries: z.array(z.string().length(2)).max(50).default([]),
  devices: z.array(z.enum(["desktop", "mobile", "tablet"])).default([...DEFAULT_TARGETING.devices]),
  os: z.array(z.string().min(2).max(32)).max(20).default([]),
  languages: z.array(z.string().min(2).max(5)).max(20).default([]),
}).strict().default(DEFAULT_TARGETING)

const createCampaignSchema = z.object({
  name: z.string().min(3).max(100),
  network: z.enum(Object.keys(AD_NETWORKS) as [string, ...string[]]),
  budget: z.number().min(5).max(100000),
  dailyBudget: z.number().min(1).max(10000),
  targetUrl: z.string().url().refine(isSafeTargetUrl, "Target URL must use HTTPS and a public hostname"),
  title: z.string().min(5).max(100),
  description: z.string().min(10).max(500).optional(),
  imageUrl: z.string().url().refine(validateCreativeUrl, "Creative URL must use HTTPS and a public hostname"),
  targeting: targetingSchema,
  // Legacy clients may still send only targetCountries; keep accepting it
  // while persisting the canonical nested targeting object.
  targetCountries: z.array(z.string().length(2)).max(50).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

export async function POST(request: Request) {
  try {
    const adminDb = requireAdminClient()
    const supabase = await createClient()
    const adminSupabase = requireAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createCampaignSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json({ error: "Invalid request", details: validatedData.error.issues }, { status: 400 })
    }

    const {
      name, network, budget, dailyBudget, targetUrl,
      title, description, imageUrl, targeting, targetCountries, startDate, endDate
    } = validatedData.data
    const canonicalCountries = targeting.countries.length > 0 ? targeting.countries : (targetCountries || [])
    const canonicalTargeting = { ...targeting, countries: canonicalCountries }

    const networkConfig = AD_NETWORKS[network as keyof typeof AD_NETWORKS]
    if (budget < networkConfig.minBudget) {
      return NextResponse.json({
        error: `Minimum budget for ${networkConfig.name} is $${networkConfig.minBudget}`
      }, { status: 400 })
    }

    const { data: created, error: campaignError } = await adminSupabase.rpc("create_ad_campaign", {
      p_user_id: user.id,
      p_name: name,
      p_network: network,
      p_network_name: networkConfig.name,
      p_budget: budget,
      p_daily_budget: dailyBudget,
      p_target_url: targetUrl,
      p_title: title,
      p_description: description || null,
      p_image_url: imageUrl,
      p_target_countries: canonicalCountries,
      p_targeting: canonicalTargeting,
      p_start_date: startDate || new Date().toISOString(),
      p_end_date: endDate || null,
      p_cpm: networkConfig.cpm,
    })

    if (campaignError) {
      const message = campaignError.message.toLowerCase()
      if (message.includes("insufficient advertising balance")) {
        return NextResponse.json({ error: "Insufficient advertising balance", required: budget }, { status: 400 })
      }
      if (message.includes("advertiser profile not found")) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 })
      }
      log.error("Campaign creation RPC error", { error: campaignError })
      return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 })
    }

    const createdRow = Array.isArray(created) ? created[0] : created
    if (!createdRow?.campaign_id) {
      log.error("Campaign creation RPC returned no campaign", { error: new Error("Missing campaign_id") })
      return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 })
    }

    log.info("Ad campaign created", {
      userId: user.id,
      campaignId: createdRow.campaign_id,
      network,
      budget
    })

    return NextResponse.json({
      success: true,
      campaign: {
        id: createdRow.campaign_id,
        name,
        network,
        status: "pending",
        budget
      },
      newBalance: createdRow.new_balance
    })
  } catch (error) {
    log.error("Campaign creation error", { error })
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const adminDb = requireAdminClient()
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Get ad networks info
    if (searchParams.get("networks") === "true") {
      return NextResponse.json({ networks: AD_NETWORKS })
    }

    // Get advertising balance
    if (searchParams.get("balance") === "true") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("ad_balance_usd")
        .eq("id", user.id)
        .single()

      return NextResponse.json({ balance: profile?.ad_balance_usd || 0 })
    }

    // Get analytics with historical comparison
    if (searchParams.get("analytics") === "true") {
      const now = new Date()
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

      // Get current week data
      const { data: currentWeekCampaigns } = await supabase
        .from("ad_campaigns")
        .select("spent, impressions, clicks, conversions, created_at")
        .eq("user_id", user.id)
        .gte("created_at", oneWeekAgo.toISOString())

      // Get last week data
      const { data: lastWeekCampaigns } = await supabase
        .from("ad_campaigns")
        .select("spent, impressions, clicks, conversions, created_at")
        .eq("user_id", user.id)
        .gte("created_at", twoWeeksAgo.toISOString())
        .lt("created_at", oneWeekAgo.toISOString())

      // Calculate current week totals
      const currentSpent = currentWeekCampaigns?.reduce((sum, c) => sum + (c.spent || 0), 0) || 0
      const currentImpressions = currentWeekCampaigns?.reduce((sum, c) => sum + (c.impressions || 0), 0) || 0
      const currentClicks = currentWeekCampaigns?.reduce((sum, c) => sum + (c.clicks || 0), 0) || 0
      const currentConversions = currentWeekCampaigns?.reduce((sum, c) => sum + (c.conversions || 0), 0) || 0

      // Calculate last week totals
      const lastSpent = lastWeekCampaigns?.reduce((sum, c) => sum + (c.spent || 0), 0) || 0
      const lastImpressions = lastWeekCampaigns?.reduce((sum, c) => sum + (c.impressions || 0), 0) || 0
      const lastClicks = lastWeekCampaigns?.reduce((sum, c) => sum + (c.clicks || 0), 0) || 0
      const lastConversions = lastWeekCampaigns?.reduce((sum, c) => sum + (c.conversions || 0), 0) || 0

      // Calculate percentage changes (avoid division by zero)
      const calcChange = (current: number, last: number) => {
        if (last === 0) return current > 0 ? 100 : 0
        return Math.round(((current - last) / last) * 100)
      }

      return NextResponse.json({
        analytics: {
          spentChange: calcChange(currentSpent, lastSpent),
          impressionsChange: calcChange(currentImpressions, lastImpressions),
          clicksChange: calcChange(currentClicks, lastClicks),
          conversionsChange: calcChange(currentConversions, lastConversions),
          currentWeek: {
            spent: currentSpent,
            impressions: currentImpressions,
            clicks: currentClicks,
            conversions: currentConversions
          },
          lastWeek: {
            spent: lastSpent,
            impressions: lastImpressions,
            clicks: lastClicks,
            conversions: lastConversions
          }
        }
      })
    }

    // Get user's campaigns
    const status = searchParams.get("status")
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100)

    let query = supabase
      .from("ad_campaigns")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq("status", status)
    }

    const { data: campaigns, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ campaigns })
  } catch (error) {
    log.error("Get campaigns error", { error })
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const adminDb = requireAdminClient()
    const supabase = await createClient()
    const adminSupabase = requireAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { campaignId, action } = body

    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 })
    }

    // Get the campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("ad_campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    let newStatus = campaign.status
    let refundHandledByRpc = false

    switch (action) {
      case "pause":
        if (campaign.status === "active") {
          newStatus = "paused"
        }
        break
      case "resume":
        if (campaign.status === "paused") {
          newStatus = "active"
        }
        break
      case "stop":
        if (["active", "paused", "pending"].includes(campaign.status)) {
          const { error: refundError } = await adminSupabase.rpc("refund_campaign", {
            p_campaign_id: campaignId,
          })
          if (refundError) throw refundError
          newStatus = "stopped"
          refundHandledByRpc = true
        }
        break
    }

    if (newStatus !== campaign.status && !refundHandledByRpc) {
      await adminDb
        .from("ad_campaigns")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", campaignId)
    }

    return NextResponse.json({
      success: true,
      campaign: { ...campaign, status: newStatus }
    })
  } catch (error) {
    log.error("Update campaign error", { error })
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 })
  }
}

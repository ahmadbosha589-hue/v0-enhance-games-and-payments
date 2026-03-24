import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { log } from "@/lib/logger"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"

// Ad Networks supported
const AD_NETWORKS = {
  "google-ads": { name: "Google Ads", minBudget: 10, cpm: 2.5 },
  "facebook-ads": { name: "Facebook Ads", minBudget: 5, cpm: 3.0 },
  "tiktok-ads": { name: "TikTok Ads", minBudget: 20, cpm: 2.0 },
  "twitter-ads": { name: "Twitter/X Ads", minBudget: 10, cpm: 4.0 },
  "banner-network": { name: "Banner Network", minBudget: 5, cpm: 1.5 },
  "native-ads": { name: "Native Ads", minBudget: 10, cpm: 2.8 },
  "push-notifications": { name: "Push Notifications", minBudget: 5, cpm: 0.5 },
  "popup-ads": { name: "Popup Ads", minBudget: 5, cpm: 1.0 }
}

const createCampaignSchema = z.object({
  name: z.string().min(3).max(100),
  network: z.enum(Object.keys(AD_NETWORKS) as [string, ...string[]]),
  budget: z.number().min(5).max(100000),
  dailyBudget: z.number().min(1).max(10000),
  targetUrl: z.string().url(),
  title: z.string().min(5).max(100),
  description: z.string().min(10).max(500).optional(),
  imageUrl: z.string().url().optional(),
  targetCountries: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

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
      title, description, imageUrl, targetCountries, startDate, endDate
    } = validatedData.data

    // Get user profile to check advertising balance
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("ad_balance_usd")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Check if user has enough advertising balance
    if (Number(profile.ad_balance_usd || 0) < budget) {
      return NextResponse.json({
        error: "Insufficient advertising balance",
        required: budget,
        available: profile.ad_balance_usd || 0
      }, { status: 400 })
    }

    // Check network minimum budget
    const networkConfig = AD_NETWORKS[network as keyof typeof AD_NETWORKS]
    if (budget < networkConfig.minBudget) {
      return NextResponse.json({
        error: `Minimum budget for ${networkConfig.name} is $${networkConfig.minBudget}`
      }, { status: 400 })
    }

    const campaignId = uuidv4()

    // Create the campaign
    const { data: campaign, error: campaignError } = await adminSupabase
      .from("ad_campaigns")
      .insert({
        id: campaignId,
        user_id: user.id,
        name,
        network,
        network_name: networkConfig.name,
        budget,
        daily_budget: dailyBudget,
        spent: 0,
        target_url: targetUrl,
        title,
        description,
        image_url: imageUrl,
        target_countries: targetCountries,
        start_date: startDate || new Date().toISOString(),
        end_date: endDate,
        status: "pending",
        impressions: 0,
        clicks: 0,
        cpm: networkConfig.cpm
      })
      .select()
      .single()

    if (campaignError) {
      log.error("Campaign creation error", { error: campaignError })
      return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 })
    }

    // Deduct from advertising balance
    const newBalance = Number(profile.ad_balance_usd) - budget
    await adminSupabase
      .from("profiles")
      .update({ ad_balance_usd: newBalance })
      .eq("id", user.id)

    // Create transaction record
    await adminSupabase.from("ad_transactions").insert({
      user_id: user.id,
      campaign_id: campaignId,
      type: "campaign_created",
      amount: -budget,
      balance_before: profile.ad_balance_usd,
      balance_after: newBalance,
      description: `Campaign created: ${name}`
    })

    log.info("Ad campaign created", {
      userId: user.id,
      campaignId,
      network,
      budget
    })

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        network: campaign.network,
        status: campaign.status,
        budget: campaign.budget
      },
      newBalance
    })
  } catch (error) {
    log.error("Campaign creation error", { error })
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
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
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

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
          newStatus = "stopped"

          // Refund remaining budget
          const remaining = campaign.budget - campaign.spent
          if (remaining > 0) {
            const { data: profile } = await adminSupabase
              .from("profiles")
              .select("ad_balance_usd")
              .eq("id", user.id)
              .single()

            if (profile) {
              const newBalance = Number(profile.ad_balance_usd) + remaining
              await adminSupabase
                .from("profiles")
                .update({ ad_balance_usd: newBalance })
                .eq("id", user.id)

              await adminSupabase.from("ad_transactions").insert({
                user_id: user.id,
                campaign_id: campaignId,
                type: "campaign_refund",
                amount: remaining,
                balance_before: profile.ad_balance_usd,
                balance_after: newBalance,
                description: `Campaign stopped: ${campaign.name} - Refund`
              })
            }
          }
        }
        break
    }

    if (newStatus !== campaign.status) {
      await supabase
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

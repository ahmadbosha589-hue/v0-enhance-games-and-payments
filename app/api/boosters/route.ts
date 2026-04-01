import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    
    if (!supabase || !adminSupabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    // Get all active booster tiers
    const { data: tiers, error: tiersError } = await adminSupabase
      .from("booster_tiers")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: true })

    if (tiersError) {
      console.error("Error fetching booster tiers:", tiersError)
      // Return default tiers if table doesn't exist
      return NextResponse.json({
        tiers: getDefaultTiers(),
        activeBooster: null,
      })
    }

    // Get user's active booster if logged in
    let activeBooster = null
    if (user) {
      const { data: userBooster } = await adminSupabase
        .from("user_boosters")
        .select(`
          id,
          started_at,
          expires_at,
          is_active,
          booster_tiers (
            id,
            name,
            slug,
            faucet_bonus_percentage,
            offerwall_bonus_percentage,
            badge_color,
            badge_icon
          )
        `)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .single()

      if (userBooster) {
        const tier = userBooster.booster_tiers as any
        const expiresAt = new Date(userBooster.expires_at)
        const now = new Date()
        const hoursRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)))
        const daysRemaining = Math.max(0, Math.floor(hoursRemaining / 24))

        activeBooster = {
          id: userBooster.id,
          tier: tier?.name || "Unknown",
          slug: tier?.slug || "unknown",
          faucetBonus: tier?.faucet_bonus_percentage || 0,
          offerwallBonus: tier?.offerwall_bonus_percentage || 0,
          expiresAt: userBooster.expires_at,
          hoursRemaining,
          daysRemaining,
          badgeColor: tier?.badge_color || "#22c55e",
          badgeIcon: tier?.badge_icon || "zap",
        }
      }
    }

    return NextResponse.json({
      tiers: tiers || getDefaultTiers(),
      activeBooster,
    })
  } catch (error) {
    console.error("Boosters API error:", error)
    return NextResponse.json({ 
      error: "Internal server error",
      tiers: getDefaultTiers(),
      activeBooster: null 
    }, { status: 500 })
  }
}

function getDefaultTiers() {
  return [
    {
      id: "basic",
      name: "Basic",
      slug: "basic",
      description: "Perfect for getting started. Boost your earnings with a solid bonus on all activities.",
      price_usd: 5.00,
      price_satoshis: 5000,
      faucet_bonus_percentage: 100,
      offerwall_bonus_percentage: 10,
      duration_days: 7,
      badge_color: "#22c55e",
      badge_icon: "zap",
      priority: 1,
      features: ["100% faucet claim bonus", "10% offerwall bonus", "7 days duration", "Basic badge"],
    },
    {
      id: "pro",
      name: "Pro",
      slug: "pro",
      description: "Step up your game with enhanced bonuses and longer duration.",
      price_usd: 10.00,
      price_satoshis: 10000,
      faucet_bonus_percentage: 200,
      offerwall_bonus_percentage: 20,
      duration_days: 15,
      badge_color: "#3b82f6",
      badge_icon: "flame",
      priority: 2,
      features: ["200% faucet claim bonus", "20% offerwall bonus", "15 days duration", "Pro badge", "Priority support"],
    },
    {
      id: "elite",
      name: "Elite",
      slug: "elite",
      description: "For serious earners. Maximum bonuses to supercharge your income.",
      price_usd: 20.00,
      price_satoshis: 20000,
      faucet_bonus_percentage: 300,
      offerwall_bonus_percentage: 35,
      duration_days: 30,
      badge_color: "#a855f7",
      badge_icon: "crown",
      priority: 3,
      features: ["300% faucet claim bonus", "35% offerwall bonus", "30 days duration", "Elite badge", "Priority support", "Early access to features"],
    },
    {
      id: "legend",
      name: "Legend",
      slug: "legend",
      description: "The ultimate package. Legendary bonuses for legendary earners.",
      price_usd: 50.00,
      price_satoshis: 50000,
      faucet_bonus_percentage: 500,
      offerwall_bonus_percentage: 50,
      duration_days: 30,
      badge_color: "#f59e0b",
      badge_icon: "star",
      priority: 4,
      features: ["500% faucet claim bonus", "50% offerwall bonus", "30 days duration", "Legend badge", "VIP support", "Early access to features", "Exclusive tournaments"],
    },
  ]
}

// POST - Purchase a booster
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    
    if (!supabase || !adminSupabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { tierId, paymentMethod, paymentReference, transactionHash } = body

    if (!tierId || !paymentMethod) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Get the booster tier
    const { data: tier, error: tierError } = await adminSupabase
      .from("booster_tiers")
      .select("*")
      .eq("id", tierId)
      .eq("is_active", true)
      .single()

    if (tierError || !tier) {
      return NextResponse.json({ error: "Invalid booster tier" }, { status: 400 })
    }

    // Check if user already has an active booster
    const { data: existingBooster } = await adminSupabase
      .from("user_boosters")
      .select("id, expires_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .single()

    // Calculate new expiry date (extend if existing)
    let expiresAt: Date
    if (existingBooster) {
      expiresAt = new Date(existingBooster.expires_at)
      expiresAt.setDate(expiresAt.getDate() + tier.duration_days)
    } else {
      expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + tier.duration_days)
    }

    // Create purchase record
    const { data: purchase, error: purchaseError } = await adminSupabase
      .from("booster_purchases")
      .insert({
        user_id: user.id,
        booster_tier_id: tier.id,
        payment_method: paymentMethod,
        payment_status: "completed",
        payment_reference: paymentReference,
        amount_usd: tier.price_usd,
        amount_satoshis: tier.price_satoshis,
        transaction_hash: transactionHash,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (purchaseError) {
      console.error("Purchase error:", purchaseError)
      return NextResponse.json({ error: "Failed to create purchase record" }, { status: 500 })
    }

    // Deactivate existing booster if upgrading
    if (existingBooster) {
      await adminSupabase
        .from("user_boosters")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", existingBooster.id)
    }

    // Create new user booster
    const { data: userBooster, error: boosterError } = await adminSupabase
      .from("user_boosters")
      .insert({
        user_id: user.id,
        booster_tier_id: tier.id,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        amount_paid_usd: tier.price_usd,
        amount_paid_satoshis: tier.price_satoshis,
      })
      .select()
      .single()

    if (boosterError) {
      console.error("Booster creation error:", boosterError)
      return NextResponse.json({ error: "Failed to activate booster" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      booster: {
        id: userBooster.id,
        tier: tier.name,
        expiresAt: userBooster.expires_at,
        faucetBonus: tier.faucet_bonus_percentage,
        offerwallBonus: tier.offerwall_bonus_percentage,
      },
    })
  } catch (error) {
    console.error("Booster purchase error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

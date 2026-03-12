import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()

    // Get user session
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      },
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { adId, viewId } = body

    if (!adId) {
      return NextResponse.json({ error: "Missing ad ID" }, { status: 400 })
    }

    // Get ad details
    const { data: ad, error: adError } = await supabaseAdmin
      .from("ptc_ads")
      .select("*")
      .eq("id", adId)
      .eq("is_active", true)
      .eq("is_approved", true)
      .gt("remaining_budget_satoshis", 0)
      .single()

    if (adError || !ad) {
      return NextResponse.json({ error: "Ad not found or expired" }, { status: 404 })
    }

    // Check if user already watched this ad (unique constraint on user_id, ad_id)
    const { data: existingView } = await supabaseAdmin
      .from("ptc_views")
      .select("id")
      .eq("user_id", user.id)
      .eq("ad_id", adId)
      .single()

    if (existingView) {
      return NextResponse.json({ error: "Already watched this ad" }, { status: 400 })
    }

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("balance_satoshis, total_earned_satoshis")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const rewardSatoshis = ad.reward_satoshis

    // Update or create view record
    if (viewId) {
      await supabaseAdmin
        .from("ptc_views")
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq("id", viewId)
        .eq("user_id", user.id)
    } else {
      await supabaseAdmin.from("ptc_views").insert({
        user_id: user.id,
        ad_id: adId,
        reward_satoshis: rewardSatoshis,
        view_duration_seconds: ad.duration_seconds,
        completed: true,
        completed_at: new Date().toISOString(),
      })
    }

    // Credit user balance
    const newBalance = profile.balance_satoshis + rewardSatoshis
    const newTotalEarned = (profile.total_earned_satoshis || 0) + rewardSatoshis
    await supabaseAdmin
      .from("profiles")
      .update({
        balance_satoshis: newBalance,
        total_earned_satoshis: newTotalEarned,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    // Deduct from ad budget
    await supabaseAdmin
      .from("ptc_ads")
      .update({
        remaining_budget_satoshis: ad.remaining_budget_satoshis - rewardSatoshis,
        total_views: ad.total_views + 1,
        total_unique_views: ad.total_unique_views + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", adId)

    // Create transaction record
    await supabaseAdmin.from("transactions").insert({
      user_id: user.id,
      type: "ptc",
      amount_satoshis: rewardSatoshis,
      balance_before: profile.balance_satoshis,
      balance_after: newBalance,
      status: "completed",
      description: `PTC Ad: ${ad.title}`,
    })

    return NextResponse.json({
      success: true,
      reward: rewardSatoshis,
      newBalance,
    })
  } catch (error) {
    console.error("PTC complete error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

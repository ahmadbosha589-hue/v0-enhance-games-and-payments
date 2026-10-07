import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { REFERRAL_CONFIG } from "@/lib/constants/config"

// This route processes referral bonuses when a claim is made
export async function POST(request: Request) {
  try {
    const { claimId, userId, claimAmount } = await request.json()

    if (!claimId || !userId || !claimAmount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const supabase = await createClient()

    // Get the user's profile to find their referrer
    const { data: profile } = await supabase.from("profiles").select("id, referred_by").eq("id", userId).single()

    if (!profile || !profile.referred_by) {
      return NextResponse.json({ message: "No referrer found", processed: false })
    }

    const referralBonuses: { userId: string; tier: number; amount: number }[] = []

    // Process multi-tier referrals
    let currentReferrerId = profile.referred_by
    for (const tier of REFERRAL_CONFIG.tiers) {
      if (!currentReferrerId) break

      // Get the referrer's profile
      const { data: referrer } = await supabase
        .from("profiles")
        .select("id, referred_by, status")
        .eq("id", currentReferrerId)
        .single()

      if (!referrer || referrer.status === "banned" || referrer.status === "suspended") {
        break
      }

      // Calculate bonus amount
      const bonusAmount = Math.floor((claimAmount * tier.percentage) / 100)

      if (bonusAmount > 0) {
        referralBonuses.push({
          userId: referrer.id,
          tier: tier.tier,
          amount: bonusAmount,
        })

        // Credit the referrer
        await Promise.resolve(supabase
          .rpc("credit_referral_bonus", {
            p_referrer_id: referrer.id,
            p_amount: bonusAmount,
            p_claim_id: claimId,
            p_referred_user_id: userId,
            p_tier: tier.tier,
          }))
          .catch(async () => {
            // Fallback if RPC doesn't exist - manual update
            const { data: currentProfile } = await supabase
              .from("profiles")
              .select("balance_satoshis, referral_earnings_satoshis, total_earned_satoshis")
              .eq("id", referrer.id)
              .single()

            if (currentProfile) {
              await supabase
                .from("profiles")
                .update({
                  balance_satoshis: (currentProfile.balance_satoshis || 0) + bonusAmount,
                  referral_earnings_satoshis: (currentProfile.referral_earnings_satoshis || 0) + bonusAmount,
                  total_earned_satoshis: (currentProfile.total_earned_satoshis || 0) + bonusAmount,
                })
                .eq("id", referrer.id)

              // Create transaction record
              await supabase.from("transactions").insert({
                user_id: referrer.id,
                type: "referral_bonus",
                amount_satoshis: bonusAmount,
                status: "completed",
                description: `Tier ${tier.tier} referral bonus`,
                referral_id: userId,
                claim_id: claimId,
                balance_before: currentProfile.balance_satoshis || 0,
                balance_after: (currentProfile.balance_satoshis || 0) + bonusAmount,
                completed_at: new Date().toISOString(),
              })
            }
          })
      }

      // Move to the next tier (referrer's referrer)
      currentReferrerId = referrer.referred_by
    }

    return NextResponse.json({
      message: "Referral bonuses processed",
      processed: true,
      bonuses: referralBonuses,
    })
  } catch (error) {
    console.error("Referral processing error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

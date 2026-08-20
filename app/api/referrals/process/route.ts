import { NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"
import { CLAIM_CONFIG } from "@/lib/constants/config"

export async function POST(request: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const claimId = typeof body.claimId === "string" ? body.claimId : ""
    const requestedUserId = typeof body.userId === "string" ? body.userId : user.id
    if (!claimId || requestedUserId !== user.id) {
      return NextResponse.json({ error: "Invalid referral request" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "Referral service is temporarily unavailable" }, { status: 503 })
    }

    const { data: claim, error: claimError } = await adminSupabase
      .from("claims")
      .select("id, user_id, amount_satoshis")
      .eq("id", claimId)
      .eq("user_id", user.id)
      .single()

    if (claimError || !claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 })
    }

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("id, referred_by")
      .eq("id", user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: "Referral service is temporarily unavailable" }, { status: 503 })
    }
    if (!profile?.referred_by) {
      return NextResponse.json({ message: "No referrer found", processed: false })
    }

    const { data: result, error: commissionError } = await adminSupabase.rpc("process_referral_commission", {
      p_claim_id: claim.id,
      p_referrer_id: profile.referred_by,
      p_claim_amount: claim.amount_satoshis,
      p_commission_rate: CLAIM_CONFIG.referralBonusPercentage / 100,
    })

    if (commissionError) {
      console.error("Referral commission RPC failed:", commissionError)
      return NextResponse.json({ error: "Referral service is temporarily unavailable" }, { status: 503 })
    }

    return NextResponse.json({
      processed: Boolean(result?.success),
      commission: result?.commission || 0,
      transactionId: result?.transaction_id || null,
      duplicate: Boolean(result?.duplicate),
    })
  } catch (error) {
    console.error("Referral processing error:", error)
    return NextResponse.json({ error: "Referral service is temporarily unavailable" }, { status: 503 })
  }
}

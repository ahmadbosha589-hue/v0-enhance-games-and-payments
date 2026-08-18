import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const expectedKey = process.env.METRICS_API_KEY?.trim()

  if (!expectedKey && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Metrics endpoint is not configured" }, { status: 503 })
  }

  if (expectedKey) {
    const receivedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : ""
    const receivedBytes = Buffer.from(receivedKey, "utf8")
    const expectedBytes = Buffer.from(expectedKey, "utf8")
    const valid = receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes)
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const supabase = await createClient()

    // Gather metrics
    const now = new Date()
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // User metrics
    const { count: totalUsers } = await supabase.from("profiles").select("*", { count: "exact", head: true })

    const { count: activeUsersHour } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("last_claim_at", hourAgo.toISOString())

    const { count: activeUsersDay } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("last_claim_at", dayAgo.toISOString())

    const { count: bannedUsers } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_banned", true)

    const { count: flaggedUsers } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_flagged", true)

    // Claim metrics
    const { count: claimsHour } = await supabase
      .from("claims")
      .select("*", { count: "exact", head: true })
      .gte("created_at", hourAgo.toISOString())

    const { count: claimsDay } = await supabase
      .from("claims")
      .select("*", { count: "exact", head: true })
      .gte("created_at", dayAgo.toISOString())

    // Withdrawal metrics
    const { count: pendingWithdrawals } = await supabase
      .from("withdrawals")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")

    const { count: withdrawalsDay } = await supabase
      .from("withdrawals")
      .select("*", { count: "exact", head: true })
      .gte("created_at", dayAgo.toISOString())

    // Fraud metrics
    const { count: fraudFlagsPending } = await supabase
      .from("fraud_flags")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")

    // Format as Prometheus-style metrics
    const metrics = `
# HELP cryptofaucet_users_total Total number of registered users
# TYPE cryptofaucet_users_total gauge
cryptofaucet_users_total ${totalUsers || 0}

# HELP cryptofaucet_users_active_1h Users active in the last hour
# TYPE cryptofaucet_users_active_1h gauge
cryptofaucet_users_active_1h ${activeUsersHour || 0}

# HELP cryptofaucet_users_active_24h Users active in the last 24 hours
# TYPE cryptofaucet_users_active_24h gauge
cryptofaucet_users_active_24h ${activeUsersDay || 0}

# HELP cryptofaucet_users_banned Total banned users
# TYPE cryptofaucet_users_banned gauge
cryptofaucet_users_banned ${bannedUsers || 0}

# HELP cryptofaucet_users_flagged Total flagged users
# TYPE cryptofaucet_users_flagged gauge
cryptofaucet_users_flagged ${flaggedUsers || 0}

# HELP cryptofaucet_claims_1h Claims in the last hour
# TYPE cryptofaucet_claims_1h gauge
cryptofaucet_claims_1h ${claimsHour || 0}

# HELP cryptofaucet_claims_24h Claims in the last 24 hours
# TYPE cryptofaucet_claims_24h gauge
cryptofaucet_claims_24h ${claimsDay || 0}

# HELP cryptofaucet_withdrawals_pending Pending withdrawals
# TYPE cryptofaucet_withdrawals_pending gauge
cryptofaucet_withdrawals_pending ${pendingWithdrawals || 0}

# HELP cryptofaucet_withdrawals_24h Withdrawals in the last 24 hours
# TYPE cryptofaucet_withdrawals_24h gauge
cryptofaucet_withdrawals_24h ${withdrawalsDay || 0}

# HELP cryptofaucet_fraud_flags_pending Pending fraud flags
# TYPE cryptofaucet_fraud_flags_pending gauge
cryptofaucet_fraud_flags_pending ${fraudFlagsPending || 0}
`.trim()

    return new NextResponse(metrics, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (error) {
    console.error("Metrics error:", error)
    return NextResponse.json({ error: "Failed to gather metrics" }, { status: 500 })
  }
}

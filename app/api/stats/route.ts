import { NextResponse } from "next/server"
import { logHoneypotProbeRequest } from "@/lib/security/honeypot-logger"

const FALLBACK_STATS = {
  totalUsers: 0,
  totalClaims: 0,
  totalDistributed: 0,
  totalWithdrawn: 0,
  activeUsers24h: 0,
  todayClaims: 0,
  isLive: false,
}

export async function GET() {
  // Log control probe for fortress verification
  await logHoneypotProbeRequest("ctrl_stats").catch(() => {})
  
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(FALLBACK_STATS, {
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
      })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)

    try {
      // This approach queries existing tables rather than a view that may not exist
      const [profilesResponse, claimsResponse] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/profiles?select=id,total_earned_satoshis,total_withdrawn_satoshis,last_active_at`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            signal: controller.signal,
            cache: "no-store",
          },
        ),
        fetch(`${supabaseUrl}/rest/v1/claims?select=id,created_at`, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          cache: "no-store",
        }),
      ])

      clearTimeout(timeoutId)

      // Handle table not found or other errors silently
      if (!profilesResponse.ok || !claimsResponse.ok) {
        return NextResponse.json(FALLBACK_STATS, {
          headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
        })
      }

      const profiles = await profilesResponse.json()
      const claims = await claimsResponse.json()

      // Calculate stats from raw data
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)

      const totalUsers = profiles.length
      const totalDistributed = profiles.reduce(
        (sum: number, p: { total_earned_satoshis?: number }) => sum + (Number(p.total_earned_satoshis) || 0),
        0,
      )
      const totalWithdrawn = profiles.reduce(
        (sum: number, p: { total_withdrawn_satoshis?: number }) => sum + (Number(p.total_withdrawn_satoshis) || 0),
        0,
      )
      const activeUsers24h = profiles.filter(
        (p: { last_active_at?: string }) => p.last_active_at && new Date(p.last_active_at) > yesterday,
      ).length

      const totalClaims = claims.length
      const todayClaims = claims.filter(
        (c: { created_at?: string }) => c.created_at && new Date(c.created_at) >= today,
      ).length

      return NextResponse.json(
        {
          totalUsers,
          totalClaims,
          totalDistributed,
          totalWithdrawn,
          activeUsers24h,
          todayClaims,
          isLive: true,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        },
      )
    } catch {
      clearTimeout(timeoutId)
    }

    return NextResponse.json(FALLBACK_STATS, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    })
  } catch {
    return NextResponse.json(FALLBACK_STATS, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    })
  }
}

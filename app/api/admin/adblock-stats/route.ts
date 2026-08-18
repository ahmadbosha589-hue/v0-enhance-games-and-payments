import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server"
import { log } from "@/lib/logger"

import { requireAdminClient } from "@/lib/supabase/admin-client"
export async function GET(request: Request) {
  const admin = await requireAdmin(["admin", "superadmin"])
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const supabase = requireAdminClient()

    // Get query parameters
    const url = new URL(request.url)
    const days = Number.parseInt(url.searchParams.get("days") || "7", 10)

    // Get aggregated stats using the database function
    const { data: stats, error: statsError } = await supabase.rpc("get_adblock_stats", { p_days: days }).single()

    if (statsError) {
      // Fallback to direct query if function doesn't exist
      log.warn("Adblock stats function not available, using fallback query", { error: statsError })

      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

      const { data: analyticsData, error: analyticsError } = await supabase
        .from("adblock_analytics")
        .select("adblock_detected, confidence, server_score, user_id")
        .gte("created_at", cutoffDate)

      if (analyticsError) {
        // If table doesn't exist yet, return zeros
        return NextResponse.json({
          success: true,
          data: {
            total_visits: 0,
            adblock_detections: 0,
            detection_rate: 0,
            unique_users_with_adblock: 0,
            avg_confidence: 0,
            avg_server_score: 0,
            days,
          },
        })
      }

      const totalVisits = analyticsData?.length || 0
      const detections = analyticsData?.filter((a) => a.adblock_detected) || []
      const adblockDetections = detections.length
      const detectionRate = totalVisits > 0 ? (adblockDetections / totalVisits) * 100 : 0
      const uniqueUsersWithAdblock = new Set(detections.map((d) => d.user_id)).size
      const avgConfidence =
        detections.length > 0 ? detections.reduce((sum, d) => sum + (d.confidence || 0), 0) / detections.length : 0
      const avgServerScore =
        detections.length > 0 ? detections.reduce((sum, d) => sum + (d.server_score || 0), 0) / detections.length : 0

      return NextResponse.json({
        success: true,
        data: {
          total_visits: totalVisits,
          adblock_detections: adblockDetections,
          detection_rate: Math.round(detectionRate * 100) / 100,
          unique_users_with_adblock: uniqueUsersWithAdblock,
          avg_confidence: Math.round(avgConfidence * 100) / 100,
          avg_server_score: Math.round(avgServerScore * 100) / 100,
          days,
        },
      })
    }

    const normalizedStats =
      stats && typeof stats === "object" ? (stats as Record<string, unknown>) : {}

    return NextResponse.json({
      success: true,
      data: {
        ...normalizedStats,
        days,
      },
    })
  } catch (error) {
    log.error("Error fetching adblock stats", { error })
    return NextResponse.json({ success: false, error: "Failed to fetch adblock stats" }, { status: 500 })
  }
}

import { type NextRequest, NextResponse } from "next/server"
import { getUser } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"

export const dynamic = "force-dynamic"

const VALID_GAME_TYPES = ["tetris", "block_blast", "car_racing", "snake", "memory", "flappy"]

export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const gameType = searchParams.get("gameType") || "tetris"

    if (!VALID_GAME_TYPES.includes(gameType)) {
      return NextResponse.json({ error: "Invalid game type" }, { status: 400 })
    }

    const adminSupabase = requireAdminClient()

    // Fetch top 15 scores for this game type from completed sessions
    const { data: sessions, error } = await adminSupabase
      .from("game_sessions")
      .select("user_id, score, created_at, profiles:user_id(username, display_name)")
      .eq("game_type", gameType)
      .eq("status", "completed")
      .order("score", { ascending: false })
      .limit(15)

    if (error) {
      console.error("[Leaderboard] DB error:", error)
      return NextResponse.json({ entries: [] })
    }

    // Deduplicate — keep only best score per user
    const bestScores = new Map<string, { score: number; username: string }>()
    for (const s of (sessions ?? [])) {
      const uid = s.user_id as string
      const score = s.score as number
      const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles as any
      const username = profile?.display_name || profile?.username || "Anonymous"
      if (!bestScores.has(uid) || score > bestScores.get(uid)!.score) {
        bestScores.set(uid, { score, username })
      }
    }

    // Sort by score and build leaderboard entries
    const sorted = [...bestScores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 15)

    const entries = sorted.map(([uid, { score, username }], i) => ({
      rank: i + 1,
      username,
      score,
      isCurrent: uid === user.id,
    }))

    // If current user isn't in top 15, append their best score
    const userInList = entries.some(e => e.isCurrent)
    if (!userInList) {
      const { data: userBest } = await adminSupabase
        .from("game_sessions")
        .select("score")
        .eq("game_type", gameType)
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("score", { ascending: false })
        .limit(1)
        .maybeSingle()  // won't throw when user has no completed sessions

      if (userBest) {
        entries.push({
          rank: entries.length + 1,
          username: "You",
          score: userBest.score,
          isCurrent: true,
        })
      }
    }

    return NextResponse.json({ entries })
  } catch (error) {
    console.error("[Leaderboard] Error:", error)
    return NextResponse.json({ entries: [] })
  }
}

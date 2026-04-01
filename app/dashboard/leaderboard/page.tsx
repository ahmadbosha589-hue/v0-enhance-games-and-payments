import { getUser, getProfile, safeQuery, createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LeaderboardTable } from "@/components/dashboard/leaderboard-table"
import { Trophy, Medal, Award } from "lucide-react"
import { UserTierBadge, type UserTier } from "@/components/ui/user-tier-badge"

async function getUserTier(userId: string): Promise<UserTier> {
  try {
    const supabase = await createClient()
    if (!supabase) return "none"
    
    const { data } = await supabase
      .from("user_boosters")
      .select("tier")
      .eq("user_id", userId)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
    
    return (data?.tier as UserTier) || "none"
  } catch {
    return "none"
  }
}

export default async function LeaderboardPage() {
  const user = await getUser()

  if (!user) redirect("/auth/login?redirect=/dashboard/leaderboard")

  // Fetch leaderboard with safe query
  const leaderboardData = await safeQuery(
    (supabase) =>
      supabase
        .from("profiles")
        .select("id, display_name, total_earned_satoshis, total_claims, max_claim_streak")
        .eq("status", "active")
        .order("total_earned_satoshis", { ascending: false })
        .limit(100),
    [],
  )

  // Get user tiers for top users (only for top 10 to avoid too many queries)
  const leaderboard = await Promise.all(
    leaderboardData.map(async (entry: any, index: number) => ({
      ...entry,
      tier: index < 10 ? await getUserTier(entry.id) : "none" as UserTier
    }))
  )

  // Get current user's stats
  const profile = await getProfile(user.id)

  // Calculate user rank
  let userRank = 0
  if (profile && profile.total_earned_satoshis > 0) {
    const higherCount = await safeQuery(
      (supabase) =>
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gt("total_earned_satoshis", profile.total_earned_satoshis),
      null,
    )
    // This is a bit tricky - we need the count from the response
    userRank = leaderboard.findIndex((e) => e.id === user.id) + 1
    if (userRank === 0 && profile) {
      userRank = leaderboard.filter((e) => e.total_earned_satoshis > profile.total_earned_satoshis).length + 1
    }
  }

  const topThree = leaderboard.slice(0, 3)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-muted-foreground">See how you compare to other earners</p>
      </div>

      {/* Your Rank - Enhanced design */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Your Rank</p>
              <p className="text-3xl sm:text-4xl font-bold">#{userRank || "—"}</p>
            </div>
            <Trophy className="h-10 w-10 sm:h-12 sm:w-12 text-primary/50" />
          </div>
        </CardContent>
      </Card>

      {/* Top 3 - Improved responsiveness */}
      {topThree.length > 0 && (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
          {topThree.map((entry, index) => {
            const icons = [Trophy, Medal, Award]
            const colors = ["text-yellow-500", "text-gray-400", "text-amber-600"]
            const bgColors = ["bg-yellow-500/10", "bg-gray-400/10", "bg-amber-600/10"]
            const borderColors = ["border-yellow-500/30", "border-gray-400/30", "border-amber-600/30"]
            const Icon = icons[index]

            return (
              <Card key={entry.id} className={`${index === 0 ? borderColors[0] : ""} transition-all hover:shadow-md`}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div
                      className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full ${bgColors[index]}`}
                    >
                      <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${colors[index]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-sm sm:text-base">{entry.display_name || "Anonymous"}</p>
                        {entry.tier && entry.tier !== "none" && (
                          <UserTierBadge tier={entry.tier} size="xs" showLabel={false} />
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {entry.total_earned_satoshis.toLocaleString()} sats
                      </p>
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-muted-foreground">#{index + 1}</div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Full Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Top 100 Earners</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Users with the highest total earnings</CardDescription>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No data available</p>
              <p className="text-sm">Be the first to start earning!</p>
            </div>
          ) : (
            <LeaderboardTable entries={leaderboard} currentUserId={user.id} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

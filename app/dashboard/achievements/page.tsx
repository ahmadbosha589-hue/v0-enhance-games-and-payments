import { Suspense } from "react"
import { getUser, getProfile, safeQuery, createAdminClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AchievementCard } from "@/components/dashboard/achievement-card"
import { Trophy, Flame, Coins, Star, Gift } from "lucide-react"

export const metadata = {
  title: "Achievements | CryptoFaucet",
  description: "Complete challenges and earn bonus satoshis",
}

interface Achievement {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  category: string
  requirement_type: string
  requirement_value: number
  reward_satoshis: number
  xp_reward: number
  badge_color: string
  is_hidden: boolean
  sort_order: number
}

interface UserAchievement {
  id: string
  achievement_id: string
  progress: number
  completed: boolean
  completed_at: string | null
  reward_claimed: boolean
  reward_claimed_at: string | null
}

async function AchievementStats({ userId }: { userId: string }) {
  const adminSupabase = createAdminClient()

  const [achievements, userAchievements, profile] = await Promise.all([
    safeQuery(() => adminSupabase.from("achievements").select("*").eq("is_active", true), []),
    safeQuery(() => adminSupabase.from("user_achievements").select("*").eq("user_id", userId), []),
    safeQuery(
      () =>
        adminSupabase
          .from("profiles")
          .select("total_claims, claim_streak, max_claim_streak, total_earned_satoshis, referral_count")
          .eq("id", userId)
          .single(),
      null,
    ),
  ])

  const getProgressForAchievement = (achievement: Achievement): number => {
    if (!profile) return 0
    switch (achievement.category) {
      case "claims":
        return profile.total_claims || 0
      case "streak":
        return profile.max_claim_streak || profile.claim_streak || 0
      case "earnings":
        return profile.total_earned_satoshis || 0
      case "referrals":
        return profile.referral_count || 0
      default:
        return 0
    }
  }

  const completedAchievements = (achievements || []).filter((achievement: Achievement) => {
    const userAchievement = (userAchievements || []).find((ua: UserAchievement) => ua.achievement_id === achievement.id)
    const progress = userAchievement?.progress ?? getProgressForAchievement(achievement)
    return userAchievement?.completed || progress >= achievement.requirement_value
  })

  const unclaimed = completedAchievements.filter((achievement: Achievement) => {
    const userAchievement = (userAchievements || []).find((ua: UserAchievement) => ua.achievement_id === achievement.id)
    return !userAchievement?.reward_claimed
  })

  const totalRewards = completedAchievements.reduce((sum: number, achievement: Achievement) => {
    return sum + (achievement.reward_satoshis || 0)
  }, 0)

  const totalXP = completedAchievements.reduce((sum: number, achievement: Achievement) => {
    return sum + (achievement.xp_reward || 0)
  }, 0)

  const stats = [
    {
      label: "Achievements",
      value: `${completedAchievements.length}/${(achievements || []).length}`,
      icon: Trophy,
      color: "text-amber-500",
    },
    { label: "Total XP", value: totalXP.toLocaleString(), icon: Star, color: "text-purple-500" },
    { label: "Rewards Earned", value: `${totalRewards.toLocaleString()} sats`, icon: Coins, color: "text-green-500" },
    { label: "Current Streak", value: `${profile?.claim_streak || 0} days`, icon: Flame, color: "text-orange-500" },
  ]

  return (
    <div className="space-y-4">
      {/* Unclaimed rewards banner */}
      {unclaimed.length > 0 && (
        <Card className="border-amber-500/50 bg-gradient-to-r from-amber-500/10 to-yellow-500/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-500/20 animate-pulse">
                <Gift className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="font-semibold text-amber-600 dark:text-amber-400">
                  {unclaimed.length} achievement{unclaimed.length > 1 ? "s" : ""} ready to claim!
                </p>
                <p className="text-sm text-muted-foreground">Scroll down to claim your rewards</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`p-1.5 sm:p-2 rounded-lg bg-muted`}>
                  <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-sm sm:text-lg font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

async function AchievementsList({ userId, category }: { userId: string; category: string }) {
  const adminSupabase = createAdminClient()

  const [achievements, userAchievements, profile] = await Promise.all([
    safeQuery(
      () =>
        adminSupabase
          .from("achievements")
          .select("*")
          .eq("is_active", true)
          .eq(category !== "all" ? "category" : "is_active", category !== "all" ? category : true)
          .order("sort_order", { ascending: true }),
      [],
    ) as Promise<Achievement[]>,
    safeQuery(() => adminSupabase.from("user_achievements").select("*").eq("user_id", userId), []) as Promise<
      UserAchievement[]
    >,
    safeQuery(
      () =>
        adminSupabase
          .from("profiles")
          .select(
            "total_claims, claim_streak, max_claim_streak, total_earned_satoshis, referral_count, total_withdrawn_satoshis",
          )
          .eq("id", userId)
          .single(),
      null,
    ),
  ])

  // Calculate progress for each achievement
  const getProgress = (achievement: Achievement): number => {
    if (!profile) return 0

    switch (achievement.category) {
      case "claims":
        return profile.total_claims || 0
      case "streak":
        return profile.max_claim_streak || profile.claim_streak || 0
      case "earnings":
        return profile.total_earned_satoshis || 0
      case "referrals":
        return profile.referral_count || 0
      case "withdrawals":
        return profile.total_withdrawn_satoshis || 0
      default:
        return 0
    }
  }

  const achievementUserMap = new Map((userAchievements || []).map((ua) => [ua.achievement_id, ua]))

  if (!achievements || achievements.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No achievements in this category</p>
      </div>
    )
  }

  const sortedAchievements = [...achievements].sort((a, b) => {
    const uaA = achievementUserMap.get(a.id)
    const uaB = achievementUserMap.get(b.id)

    const progressA = uaA?.progress ?? getProgress(a)
    const progressB = uaB?.progress ?? getProgress(b)

    const aCompleted = uaA?.completed || progressA >= a.requirement_value
    const bCompleted = uaB?.completed || progressB >= b.requirement_value

    const aCanClaim = aCompleted && !uaA?.reward_claimed
    const bCanClaim = bCompleted && !uaB?.reward_claimed

    // Claimable achievements first
    if (aCanClaim && !bCanClaim) return -1
    if (!aCanClaim && bCanClaim) return 1

    // Then completed but claimed
    if (aCompleted && !bCompleted) return -1
    if (!aCompleted && bCompleted) return 1

    // Then by progress percentage (closest to completion first)
    const aPercent = progressA / a.requirement_value
    const bPercent = progressB / b.requirement_value
    if (aPercent !== bPercent) return bPercent - aPercent

    return a.sort_order - b.sort_order
  })

  return (
    <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {sortedAchievements.map((achievement) => {
        const userAchievement = achievementUserMap.get(achievement.id)
        const calculatedProgress = getProgress(achievement)

        return (
          <AchievementCard
            key={achievement.id}
            achievement={achievement}
            userAchievement={userAchievement}
            calculatedProgress={calculatedProgress}
          />
        )
      })}
    </div>
  )
}

export default async function AchievementsPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login?redirect=/dashboard/achievements")

  const profile = await getProfile(user.id)
  if (!profile) redirect("/auth/login?redirect=/dashboard/achievements")

  const categories = [
    { value: "all", label: "All" },
    { value: "claims", label: "Claims" },
    { value: "streak", label: "Streaks" },
    { value: "earnings", label: "Earnings" },
    { value: "referrals", label: "Referrals" },
    { value: "offerwalls", label: "Offerwalls" },
    { value: "ptc", label: "PTC" },
    { value: "special", label: "Special" },
  ]

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 sm:h-7 sm:w-7 text-amber-500" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Achievements</h1>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground">
          Complete challenges and milestones to earn bonus satoshis and XP
        </p>
      </div>

      {/* Stats */}
      <Suspense
        fallback={
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        }
      >
        <AchievementStats userId={user.id} />
      </Suspense>

      {/* Achievements by Category */}
      <Tabs defaultValue="all" className="space-y-4 sm:space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1 sm:gap-2 bg-transparent p-0">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat.value}
              value={cat.value}
              className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full border"
            >
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map((cat) => (
          <TabsContent key={cat.value} value={cat.value} className="mt-4 sm:mt-6">
            <Suspense
              fallback={
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-64" />
                  ))}
                </div>
              }
            >
              <AchievementsList userId={user.id} category={cat.value} />
            </Suspense>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

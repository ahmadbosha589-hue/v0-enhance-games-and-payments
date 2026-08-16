import { getUser, getProfile, safeQuery } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReferralLink } from "@/components/dashboard/referral-link"
import { ReferralStats } from "@/components/dashboard/referral-stats"
import { REFERRAL_CONFIG } from "@/lib/constants/config"
import { Users, Gift, TrendingUp, Activity, Trophy, Coins, AlertCircle } from "lucide-react"
import { formatSatoshisDisplay, formatNumber } from "@/lib/utils/format"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import Link from "next/link"

function ProfileErrorState() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Referral Program</h1>
        <p className="text-muted-foreground">Invite friends and earn commission on their claims forever</p>
      </div>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unable to Load Profile</AlertTitle>
        <AlertDescription>
          <p className="mb-3">We couldn&apos;t load your profile data. Please try again.</p>
          <Button size="sm" asChild>
            <Link href="/dashboard/referrals">Refresh Page</Link>
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}

export default async function ReferralsPage() {
  const user = await getUser()

  if (!user) redirect("/auth/login?redirect=/dashboard/referrals")

  const profile = await getProfile(user.id)

  if (!profile) {
    return <ProfileErrorState />
  }

  const referrals = await safeQuery(
    (supabase) =>
      supabase
        .from("profiles")
        .select("id, display_name, created_at, total_earned_satoshis, last_claim_at, status")
        .eq("referred_by", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    [],
  )

  // Calculate active referrals (claimed in last 7 days)
  const activeReferrals = referrals.filter((r) => {
    if (!r.last_claim_at) return false
    const lastClaim = new Date(r.last_claim_at)
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    return lastClaim > weekAgo
  }).length

  const recentEarnings = await safeQuery(
    (supabase) =>
      supabase
        .from("transactions")
        .select("amount_satoshis, created_at")
        .eq("user_id", user.id)
        .eq("type", "referral_bonus")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false }),
    [],
  )

  const weeklyEarnings = recentEarnings.reduce((sum, t) => sum + t.amount_satoshis, 0)

  // Calculate referral milestones
  const milestones = [
    { count: 5, reward: "Bronze Badge", achieved: profile.referral_count >= 5 },
    { count: 25, reward: "Silver Badge", achieved: profile.referral_count >= 25 },
    { count: 100, reward: "Gold Badge", achieved: profile.referral_count >= 100 },
    { count: 500, reward: "Platinum Badge", achieved: profile.referral_count >= 500 },
  ]

  const nextMilestone = milestones.find((m) => !m.achieved)
  const milestoneProgress = nextMilestone ? (profile.referral_count / nextMilestone.count) * 100 : 100

  const stats = [
    {
      icon: Users,
      label: "Total Referrals",
      value: formatNumber(profile.referral_count),
      subtext: `${activeReferrals} active this week`,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      icon: Gift,
      label: "Total Earnings",
      value: formatSatoshisDisplay(profile.referral_earnings_satoshis),
      subtext: `+${formatSatoshisDisplay(weeklyEarnings)} this week`,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      icon: TrendingUp,
      label: "Commission Rate",
      value: `${REFERRAL_CONFIG.bonusPercentage}%`,
      subtext: "Per direct referral claim",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      icon: Activity,
      label: "Active Rate",
      value: profile.referral_count > 0 ? `${Math.round((activeReferrals / profile.referral_count) * 100)}%` : "0%",
      subtext: "Referrals active this week",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Referral Program</h1>
        <p className="text-muted-foreground">Invite friends and earn commission on their claims forever</p>
      </div>

      {/* Stats Grid - Improved responsiveness */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="transition-all hover:shadow-md">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3 sm:gap-4">
                <div
                  className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg ${stat.bgColor}`}
                >
                  <stat.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${stat.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">{stat.label}</p>
                  <p className="text-lg sm:text-xl font-bold truncate">{stat.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{stat.subtext}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Milestone Progress */}
      {nextMilestone && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                <CardTitle className="text-base sm:text-lg">Next Milestone</CardTitle>
              </div>
              <Badge variant="outline">{nextMilestone.reward}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-muted-foreground">
                  {profile.referral_count} / {nextMilestone.count} referrals
                </span>
                <span className="font-medium">{Math.round(milestoneProgress)}%</span>
              </div>
              <Progress value={milestoneProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Invite {nextMilestone.count - profile.referral_count} more friends to unlock {nextMilestone.reward}!
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Referral Link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Your Referral Link</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Share this link to earn commission on your referrals&apos; claims
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReferralLink referralCode={profile.referral_code} />
        </CardContent>
      </Card>

      {/* Commission Tiers - Improved responsiveness */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <CardTitle className="text-base sm:text-lg">Multi-Tier Commission</CardTitle>
          </div>
          <CardDescription className="text-xs sm:text-sm">
            Earn from multiple levels of referrals - passive income that grows!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:gap-4 grid-cols-3">
            {REFERRAL_CONFIG.tiers.map((tier, index) => (
              <div
                key={tier.tier}
                className={`rounded-lg border p-3 sm:p-4 text-center transition-all hover:border-primary/50 ${index === 0 ? "bg-primary/5 border-primary/20" : ""
                  }`}
              >
                <div className="text-2xl sm:text-3xl font-bold text-primary">{tier.percentage}%</div>
                <div className="text-xs sm:text-sm font-medium mt-1">
                  Tier {tier.tier}
                  {tier.tier === 1 && " (Direct)"}
                </div>
                <div className="text-xs text-muted-foreground mt-1 hidden sm:block">
                  {tier.tier === 1 && "Your direct referrals"}
                  {tier.tier === 2 && "Their referrals"}
                  {tier.tier === 3 && "Third level"}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-muted/50 p-3 text-center text-xs sm:text-sm text-muted-foreground">
            Example: If your referral claims 100 sats, you earn <strong className="text-foreground">10 sats</strong>{" "}
            instantly!
          </div>
        </CardContent>
      </Card>

      {/* Referral List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Your Referrals</CardTitle>
              <CardDescription className="text-xs sm:text-sm">People who signed up using your link</CardDescription>
            </div>
            {referrals.length > 0 && <Badge variant="secondary">{referrals.length} total</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No referrals yet</p>
              <p className="text-sm">Share your link to start earning!</p>
            </div>
          ) : (
            <ReferralStats referrals={referrals} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

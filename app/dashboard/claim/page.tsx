import { getUser, getProfile } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ClaimInterface } from "@/components/dashboard/claim-interface"
import { DailyBonusButton } from "@/components/dashboard/daily-bonus-button"
import { FaucetHealth } from "@/components/dashboard/faucet-health"
import { Flame, Gift, Clock, TrendingUp, AlertCircle, Sparkles, Target, Zap } from "lucide-react"
import { formatSatoshisDisplay, formatNumber } from "@/lib/utils/format"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ResponsiveAd } from "@/components/ads/responsive-ad"

function ProfileErrorState() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Claim Satoshis</h1>
        <p className="text-muted-foreground text-sm sm:text-base">Earn free satoshis every 5 minutes</p>
      </div>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Profile Not Found</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>We couldn&apos;t load your profile. This might be due to a temporary connection issue.</p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" asChild>
              <Link href="/dashboard/claim">Try Again</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  )
}

async function getServerConfig() {
  "use server"
  return {
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
  }
}

export default async function ClaimPage() {
  const user = await getUser()

  if (!user) redirect("/auth/login?redirect=/dashboard/claim")

  const profile = await getProfile(user.id)

  if (!profile) {
    return <ProfileErrorState />
  }

  const config = await getServerConfig()

  const infoCards = [
    {
      icon: Clock,
      title: "Claim Cooldown",
      value: "5 minutes",
      description: "Time between claims",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      icon: Flame,
      title: "Current Streak",
      value: `${profile.claim_streak} days`,
      description: "Keep claiming daily!",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      icon: Gift,
      title: "Reward Range",
      value: "4-9 sats",
      description: "Per claim",
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      icon: TrendingUp,
      title: "Total Earned",
      value: formatSatoshisDisplay(profile.total_earned_satoshis),
      description: `From ${formatNumber(profile.total_claims)} claims`,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
  ]

  const tips = [
    {
      icon: Zap,
      title: "Claim Regularly",
      description: "Come back every 5 minutes to maximize your earnings",
    },
    {
      icon: Target,
      title: "Build Your Streak",
      description: "Claim at least once per day to maintain your streak",
    },
    {
      icon: Sparkles,
      title: "Invite Friends",
      description: "Earn 10% of your referrals' claims automatically",
    },
  ]

  return (
    <div className="space-y-6">
      <ResponsiveAd position="header" className="mb-2" mobileHidden />

      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Claim Satoshis</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Earn <span className="font-semibold text-primary">4-9 satoshis</span> every 5 minutes
        </p>
      </div>

      {/* Faucet Health Component */}
      <FaucetHealth />

      <DailyBonusButton />

      <ClaimInterface profile={profile} turnstileSiteKey={config.turnstileSiteKey} />

      <ResponsiveAd position="between-content" className="my-2" />

      {/* Info Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {infoCards.map((card) => (
          <Card key={card.title} className="transition-all hover:shadow-md hover:scale-[1.02]">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{card.title}</p>
                  <p className="text-base sm:text-lg font-bold truncate">{card.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{card.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tips Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Tips to Maximize Earnings
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Follow these tips to earn more satoshis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {tips.map((tip) => (
              <div
                key={tip.title}
                className="flex items-start gap-3 rounded-lg border p-3 transition-all hover:border-primary/30 hover:bg-muted/50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <tip.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-sm">{tip.title}</h4>
                  <p className="text-xs text-muted-foreground">{tip.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ResponsiveAd position="footer" className="mt-4" />
    </div>
  )
}

import { Suspense } from "react"
import Link from "next/link"
import { getUser, getProfile, safeQuery, createAdminClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Coins, Gift, Play, Trophy, Zap, ArrowRight, TrendingUp, Users, Target, Gamepad2, Ticket, Link2, HandCoins } from "lucide-react"

export const metadata = {
  title: "Earn | CryptoFaucet",
  description: "Multiple ways to earn free satoshis - Faucet, Offerwalls, PTC Ads, and Achievements",
}

function EarnPageSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    </div>
  )
}

async function EarnStats({ userId }: { userId: string }) {
  const adminSupabase = createAdminClient()

  const [profile, offerwallEarnings, ptcEarnings, achievements] = await Promise.all([
    safeQuery(
      () =>
        adminSupabase
          .from("profiles")
          .select("balance_satoshis, total_earned_satoshis, total_claims")
          .eq("id", userId)
          .single(),
      null,
    ),
    safeQuery(
      () =>
        adminSupabase
          .from("offerwall_conversions")
          .select("payout_satoshis")
          .eq("user_id", userId)
          .eq("status", "approved"),
      [],
    ),
    safeQuery(
      () => adminSupabase.from("ptc_views").select("reward_satoshis").eq("user_id", userId).eq("completed", true),
      [],
    ),
    safeQuery(
      () => adminSupabase.from("user_achievements").select("*").eq("user_id", userId).eq("completed", true),
      [],
    ),
  ])

  const offerwallTotal = (offerwallEarnings || []).reduce((sum: number, c: any) => sum + (c.payout_satoshis || 0), 0)
  const ptcTotal = (ptcEarnings || []).reduce((sum: number, v: any) => sum + (v.reward_satoshis || 0), 0)

  const stats = [
    {
      title: "Current Balance",
      value: `${(profile?.balance_satoshis || 0).toLocaleString()} sats`,
      icon: Coins,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
    {
      title: "Total Earned",
      value: `${(profile?.total_earned_satoshis || 0).toLocaleString()} sats`,
      icon: TrendingUp,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Offerwall Earnings",
      value: `${offerwallTotal.toLocaleString()} sats`,
      icon: Gift,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Achievements",
      value: `${(achievements || []).length} unlocked`,
      icon: Trophy,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
  ]

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="border-border/50">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`p-1.5 sm:p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stat.title}</p>
                <p className="text-sm sm:text-lg font-bold truncate">{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default async function EarnPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login?redirect=/dashboard/earn")

  const profile = await getProfile(user.id)
  if (!profile) redirect("/auth/login?redirect=/dashboard/earn")

  const earnMethods = [
    {
      title: "Faucet Claims",
      description: "Claim free satoshis every 5 minutes. Build your streak for bonus rewards!",
      icon: Zap,
      color: "text-blue-500",
      bgColor: "bg-gradient-to-br from-blue-500/20 to-blue-600/10",
      borderColor: "border-blue-500/30",
      href: "/dashboard/claim",
      reward: "4-7+ sats/claim",
      badge: "Most Popular",
      badgeColor: "bg-blue-500",
    },
    {
      title: "Manual Crypto Faucet",
      description: "Claim 13 different cryptocurrencies every 7 seconds - sent to FaucetPay!",
      icon: HandCoins,
      color: "text-orange-500",
      bgColor: "bg-gradient-to-br from-orange-500/20 to-amber-500/10",
      borderColor: "border-orange-500/30",
      href: "/dashboard/manual-faucet",
      reward: "$0.0001/claim",
      badge: "Multi-Crypto",
      badgeColor: "bg-orange-500",
    },
    {
      title: "Play Games",
      description: "Play Tetris, Block Blast, and Car Racing to earn satoshis while having fun!",
      icon: Gamepad2,
      color: "text-cyan-500",
      bgColor: "bg-gradient-to-br from-cyan-500/20 to-cyan-600/10",
      borderColor: "border-cyan-500/30",
      href: "/dashboard/games",
      reward: "3 sats/game",
      badge: "Fun & Easy",
      badgeColor: "bg-cyan-500",
    },
    {
      title: "Coupon Codes",
      description: "Redeem promo codes from our social media for instant satoshi rewards!",
      icon: Ticket,
      color: "text-amber-500",
      bgColor: "bg-gradient-to-br from-amber-500/20 to-orange-500/10",
      borderColor: "border-amber-500/30",
      href: "/dashboard/coupons",
      reward: "10-1000+ sats",
      badge: "Instant",
      badgeColor: "bg-amber-500",
    },
    {
      title: "Shortlinks",
      description: "Visit links for a few seconds to earn quick satoshis. Fast and simple!",
      icon: Link2,
      color: "text-indigo-500",
      bgColor: "bg-gradient-to-br from-indigo-500/20 to-violet-500/10",
      borderColor: "border-indigo-500/30",
      href: "/dashboard/shortlinks",
      reward: "1-5 sats/link",
      badge: "Quick",
      badgeColor: "bg-indigo-500",
    },
    {
      title: "Offerwalls",
      description: "Complete surveys, download apps, and finish tasks from our partner networks.",
      icon: Gift,
      color: "text-purple-500",
      bgColor: "bg-gradient-to-br from-purple-500/20 to-purple-600/10",
      borderColor: "border-purple-500/30",
      href: "/dashboard/offerwalls",
      reward: "100-10,000+ sats",
      badge: "High Paying",
      badgeColor: "bg-purple-500",
    },
    {
      title: "PTC Ads",
      description: "Watch short advertisements and earn satoshis for your time.",
      icon: Play,
      color: "text-green-500",
      bgColor: "bg-gradient-to-br from-green-500/20 to-green-600/10",
      borderColor: "border-green-500/30",
      href: "/dashboard/ptc",
      reward: "1-50 sats/ad",
      badge: "Easy",
      badgeColor: "bg-green-500",
    },
    {
      title: "Achievements",
      description: "Complete challenges and milestones to unlock bonus satoshi rewards.",
      icon: Trophy,
      color: "text-amber-500",
      bgColor: "bg-gradient-to-br from-amber-500/20 to-amber-600/10",
      borderColor: "border-amber-500/30",
      href: "/dashboard/achievements",
      reward: "10-10,000 sats",
      badge: "Bonus",
      badgeColor: "bg-amber-500",
    },
  ]

  const bonusMethods = [
    {
      title: "Referral Program",
      description: "Invite friends and earn 10% of their faucet claims forever!",
      icon: Users,
      href: "/dashboard/referrals",
      reward: "10% commission",
    },
    {
      title: "Daily Bonus",
      description: "Claim every day to build your streak and multiply rewards.",
      icon: Target,
      href: "/dashboard/claim",
      reward: "Up to 100% bonus",
    },
  ]

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Earn Satoshis</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Multiple ways to earn free Bitcoin - choose your favorite method!
        </p>
      </div>

      {/* Stats */}
      <Suspense
        fallback={
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        }
      >
        <EarnStats userId={user.id} />
      </Suspense>

      {/* Main Earn Methods */}
      <div className="space-y-4">
        <h2 className="text-lg sm:text-xl font-semibold">Ways to Earn</h2>
        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
          {earnMethods.map((method) => (
            <Link key={method.title} href={method.href}>
              <Card
                className={`h-full border-2 ${method.borderColor} ${method.bgColor} hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer group`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className={`p-2 sm:p-3 rounded-xl bg-background/80 shadow-sm`}>
                      <method.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${method.color}`} />
                    </div>
                    <Badge className={`${method.badgeColor} text-white text-[10px] sm:text-xs`}>{method.badge}</Badge>
                  </div>
                  <CardTitle className="text-lg sm:text-xl mt-3">{method.title}</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">{method.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                      <Coins className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500" />
                      <span className="font-medium">{method.reward}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-1 group-hover:gap-2 transition-all">
                      Start Earning
                      <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Bonus Methods */}
      <div className="space-y-4">
        <h2 className="text-lg sm:text-xl font-semibold">Bonus Earnings</h2>
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2">
          {bonusMethods.map((method) => (
            <Link key={method.title} href={method.href}>
              <Card className="border-border/50 hover:border-primary/50 hover:shadow-md transition-all duration-300 cursor-pointer group">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="p-2 sm:p-3 rounded-xl bg-primary/10">
                      <method.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base">{method.title}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">{method.description}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="text-[10px] sm:text-xs">
                        {method.reward}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Tips Section */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Pro Tips to Maximize Earnings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground grid-cols-1 sm:grid-cols-2">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">1.</span>
              <span>Claim from the faucet every 5 minutes to build your streak bonus</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">2.</span>
              <span>Complete high-paying offerwall tasks during your wait time</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">3.</span>
              <span>Watch PTC ads for quick, easy satoshis</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">4.</span>
              <span>Refer friends to earn passive income from their claims</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

import { Suspense } from "react"
import Link from "next/link"
import { getUser, safeQuery } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Coins, Gift, Play, Trophy, Zap, ArrowRight, TrendingUp, Users, Target,
  Gamepad2, Ticket, Link2, HandCoins, Crown, Heart, AlertCircle, CheckCircle2,
} from "lucide-react"

import { requireAdminClient } from "@/lib/supabase/admin-client"
import { earningAvailability, countConfiguredOfferwalls, type EarnOptionAvailability } from "@/lib/earn/availability"
import { isRewardedAdsEnabled } from "@/lib/rewards/rewarded-ads"

export const metadata = {
  title: "All Earning Options | CryptoFaucet",
  description:
    "10+ ways to earn free Bitcoin and crypto - Faucet claims, Direct Crypto Faucet to FaucetPay, Games, Shortlinks, Offerwalls, PTC Ads, Coupons, Achievements, Tournaments, and more!",
}

const EARN_ICONS: Record<EarnOptionAvailability["icon"], typeof Zap> = {
  zap: Zap,
  coins: HandCoins,
  gamepad: Gamepad2,
  ticket: Ticket,
  link: Link2,
  gift: Gift,
  play: Play,
  target: Target,
  trophy: Trophy,
  rocket: Crown,
  heart: Heart,
  users: Users,
}

interface EarnProfile {
  balance_satoshis: number | null
  total_earned_satoshis: number | null
  total_claims: number | null
}

async function EarnStats({ userId }: { userId: string }) {
  const adminSupabase = requireAdminClient()

  const [profile, offerwallEarnings, ptcEarnings, achievements] = await Promise.all([
    safeQuery<EarnProfile>(
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

  // Live availability inputs — the same gates the earning routes themselves
  // check. Cards never invent reward ranges the config can contradict.
  const redisConfigured = Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
  )
  const rewardedAdsEnabled = isRewardedAdsEnabled()
  const offerwallsConfigured = countConfiguredOfferwalls()

  const options = earningAvailability({
    redisConfigured,
    rewardedAdsEnabled,
    offerwallsConfigured,
  })

  const availableCount = options.filter((o) => o.available).length

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">All Earning Options</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          {availableCount} of {options.length} earning options are live on this deployment — from instant faucet
          claims to tournaments and high-paying offerwalls!
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

      {/* Earning options — availability + reward text derive from live config
          (lib/earn/availability.ts), never hardcoded literals. */}
      <div className="space-y-4">
        <h2 className="text-lg sm:text-xl font-semibold">Ways to Earn</h2>
        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
          {options.map((option) => {
            const Icon = EARN_ICONS[option.icon]
            return (
              <Link key={option.title} href={option.href}>
                <Card
                  className={`h-full border-2 cursor-pointer group transition-all duration-300 hover:scale-[1.02] ${
                    option.available
                      ? "border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 hover:shadow-lg"
                      : "border-amber-500/30 bg-amber-500/5"
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="p-2 sm:p-3 rounded-xl bg-background/80 shadow-sm">
                        <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${option.color}`} />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {option.badge && (
                          <Badge className="bg-primary text-white text-[10px] sm:text-xs">{option.badge}</Badge>
                        )}
                        {option.available ? (
                          <span className="flex items-center gap-1 text-[10px] sm:text-xs text-green-600">
                            <CheckCircle2 className="h-3 w-3" /> Available
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] sm:text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" /> Setup Required
                          </span>
                        )}
                      </div>
                    </div>
                    <CardTitle className="text-lg sm:text-xl mt-3">{option.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {option.available ? (
                      <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                        <Coins className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500" />
                        <span className="font-medium">{option.rewardText}</span>
                      </div>
                    ) : (
                      <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-400">{option.reason}</p>
                    )}
                    <div className="flex items-center justify-end">
                      <Button variant="ghost" size="sm" className="gap-1 group-hover:gap-2 transition-all">
                        {option.available ? "Start Earning" : "Learn More"}
                        <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
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
              <span>Claim from the main faucet every 5 minutes to build your streak bonus</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">2.</span>
              <span>Use the Direct Crypto Faucet for instant FaucetPay payouts in 13 different cryptos</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">3.</span>
              <span>Complete high-paying offerwall tasks during your wait time</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">4.</span>
              <span>Watch PTC ads and play games for quick, easy satoshis</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">5.</span>
              <span>Refer friends to earn 10% passive income from their claims forever</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">6.</span>
              <span>Follow us on social media for exclusive coupon codes and bonuses</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

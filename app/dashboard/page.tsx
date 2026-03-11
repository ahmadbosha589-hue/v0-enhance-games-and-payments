import { Suspense } from "react"
import { getUser, getProfile, safeQuery } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"
import { Coins, Wallet, Users, TrendingUp, ArrowRight, Flame, Clock, Zap, Trophy } from "lucide-react"
import { formatSatoshisDisplay, formatNumber, formatRelativeTime } from "@/lib/utils/format"
import { ClaimButton } from "@/components/dashboard/claim-button"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { BalanceChart } from "@/components/dashboard/balance-chart"
import { ResponsiveAd } from "@/components/ads/responsive-ad"

async function TransactionsSection({ userId }: { userId: string }) {
  const transactions = await safeQuery(
    (supabase) =>
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
    [],
  )
  return <RecentActivity transactions={transactions} />
}

function TransactionsSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1">
            <Skeleton className="h-4 w-24 mb-1" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}

export default async function DashboardPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login")

  const profile = await getProfile(user.id)

  // NEVER use fallback balance values - if profile doesn't exist, redirect to error
  // This ensures we never show incorrect balance to users
  if (!profile) {
    // Profile should exist from the auth trigger - if not, there's a serious issue
    console.error("[Dashboard] Profile not found for user:", user.id)
    redirect("/auth/error?error=profile_not_found")
  }

  // Use verified profile data - balance comes from database only
  const safeProfile = {
    ...profile,
    // Ensure BigInt conversion for precise satoshi handling
    balance_satoshis: BigInt(profile.balance_satoshis || 0),
    total_earned_satoshis: BigInt(profile.total_earned_satoshis || 0),
    total_withdrawn_satoshis: BigInt(profile.total_withdrawn_satoshis || 0),
  }

  const stats = [
    {
      label: "Total Earned",
      value: formatSatoshisDisplay(Number(safeProfile.total_earned_satoshis)),
      icon: TrendingUp,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
    },
    {
      label: "Total Withdrawn",
      value: formatSatoshisDisplay(Number(safeProfile.total_withdrawn_satoshis)),
      icon: Wallet,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
    },
    {
      label: "Total Claims",
      value: formatNumber(profile.total_claims || 0),
      icon: Coins,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
    },
    {
      label: "Referrals",
      value: formatNumber(profile.referral_count || 0),
      icon: Users,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
      borderColor: "border-violet-500/20",
    },
  ]

  const quickActions = [
    {
      href: "/dashboard/referrals",
      icon: Users,
      iconColor: "text-violet-500",
      iconBg: "bg-violet-500/10",
      title: "Invite Friends",
      description: "Earn 10% from referrals",
    },
    {
      href: "/dashboard/leaderboard",
      icon: Trophy,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
      title: "Leaderboard",
      description: "See top earners",
    },
    {
      href: "/dashboard/settings",
      icon: Wallet,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
      title: "Setup FaucetPay",
      description: "Enable withdrawals",
    },
  ]

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <ResponsiveAd position="header" className="mb-2" mobileHidden />

      {/* Welcome Banner - Improved responsiveness */}
      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl text-balance">
            Welcome back, {profile.display_name || "User"}!
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Here&apos;s what&apos;s happening with your earnings.
          </p>
        </div>
        <Button asChild size="lg" className="w-full sm:w-auto gap-2 shadow-lg shadow-primary/20 h-11 sm:h-10">
          <Link href="/dashboard/claim">
            <Zap className="h-4 w-4" />
            Claim Now
          </Link>
        </Button>
      </div>

      {/* Balance Card - Enhanced design with perfect button alignment */}
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-primary/10 to-transparent">
        <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,black)]" />
        <CardContent className="relative p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                  <Coins className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Available Balance</p>
              </div>
              <p className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl xl:text-5xl tabular-nums">
                {formatSatoshisDisplay(Number(safeProfile.balance_satoshis))}
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5 sm:px-3 py-1 text-orange-500">
                  <Flame className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="font-medium">{profile.claim_streak || 0} day streak</span>
                </div>
                {profile.last_claim_at && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span>Last claim {formatRelativeTime(profile.last_claim_at)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="dashboard-action-buttons">
              <ClaimButton profile={profile} size="lg" />
              <Button variant="outline" size="lg" asChild className="bg-transparent h-11">
                <Link href="/dashboard/withdrawals">
                  <Wallet className="mr-2 h-4 w-4" />
                  Withdraw
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className={`stat-card ${stat.borderColor}`}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div
                  className={`flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg sm:rounded-xl ${stat.bgColor}`}
                >
                  <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{stat.label}</p>
                  <p className="text-base sm:text-lg lg:text-xl font-bold truncate tabular-nums">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ResponsiveAd position="between-content" className="my-2" />

      {/* Charts and Activity - Better grid layout */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Earnings Chart */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2 px-4 sm:px-6">
            <CardTitle className="text-base sm:text-lg">Earnings Overview</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Your earnings over the last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 px-4 sm:px-6">
            <Suspense fallback={<Skeleton className="h-[200px] sm:h-[220px] w-full" />}>
              <BalanceChart userId={user.id} />
            </Suspense>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 sm:px-6">
            <div>
              <CardTitle className="text-base sm:text-lg">Recent Activity</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Your latest transactions</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="hidden sm:flex">
              <Link href="/dashboard/history" className="flex items-center gap-1 text-xs">
                View All
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0 px-4 sm:px-6">
            <Suspense fallback={<TransactionsSkeleton />}>
              <TransactionsSection userId={user.id} />
            </Suspense>
            <Button variant="ghost" size="sm" asChild className="mt-3 w-full sm:hidden h-10">
              <Link href="/dashboard/history" className="flex items-center justify-center gap-1">
                View All Activity
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions - Enhanced cards */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quickActions.map((action) => (
          <Link key={action.href} href={action.href}>
            <Card className="group h-full cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30 active:scale-[0.98]">
              <CardContent className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
                <div
                  className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg sm:rounded-xl ${action.iconBg} transition-transform group-hover:scale-110`}
                >
                  <action.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${action.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm sm:text-base truncate">{action.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">{action.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <ResponsiveAd position="footer" className="mt-4" />
    </div>
  )
}

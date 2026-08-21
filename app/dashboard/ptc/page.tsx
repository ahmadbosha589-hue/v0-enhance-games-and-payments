import { Suspense } from "react"
import { getUser, safeQuery, createAdminClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Play, Clock, Coins, CheckCircle2, Eye, Timer, TrendingUp, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PTCAdCard } from "@/components/dashboard/ptc-ad-card"
import { OfferwallVPNGuard } from "@/components/dashboard/offerwall-vpn-guard"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"

import { requireAdminClient } from "@/lib/supabase/admin-client"
export const metadata = {
  title: "PTC Ads | CryptoFaucet",
  description: "Watch ads and earn satoshis",
}

// Force dynamic rendering to avoid build-time data collection timeouts
export const dynamic = "force-dynamic"
export const revalidate = 0

interface PTCAd {
  id: string
  title: string
  description: string
  url: string
  duration_seconds: number
  reward_satoshis: number
  total_views: number
}

interface PTCView {
  id: string
  reward_satoshis: number
  completed: boolean
  created_at: string
  ad: {
    title: string
  } | Array<{
    title: string
  }>
}

async function PTCStats({ userId }: { userId: string }) {
  const adminSupabase = requireAdminClient()

  const views = await safeQuery(
    () => adminSupabase.from("ptc_views").select("reward_satoshis, completed, created_at").eq("user_id", userId),
    [],
  )

  const completedViews = (views || []).filter((v: any) => v.completed)
  const totalEarned = completedViews.reduce((sum: number, v: any) => sum + (v.reward_satoshis || 0), 0)
  const todayViews = completedViews.filter((v: any) => {
    const viewDate = new Date(v.created_at)
    const today = new Date()
    return viewDate.toDateString() === today.toDateString()
  })

  const stats = [
    { label: "Total Earned", value: `${totalEarned.toLocaleString()} sats`, icon: Coins, color: "text-green-500" },
    { label: "Ads Watched", value: completedViews.length, icon: Eye, color: "text-blue-500" },
    { label: "Today", value: `${todayViews.length} ads`, icon: Clock, color: "text-yellow-500" },
    {
      label: "Avg Reward",
      value: `${completedViews.length > 0 ? Math.round(totalEarned / completedViews.length) : 0} sats`,
      icon: TrendingUp,
      color: "text-purple-500",
    },
  ]

  return (
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
  )
}

async function AvailableAds({ userId }: { userId: string }) {
  const adminSupabase = createAdminClient()

  if (!adminSupabase) {
    return (
      <Alert className="border-amber-500/30 bg-amber-500/10">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <AlertDescription className="text-xs sm:text-sm">
          PTC ads are temporarily unavailable because the advertising database is not configured.
        </AlertDescription>
      </Alert>
    )
  }

  // Get ads that user hasn't watched TODAY (midnight UTC reset)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayISO = today.toISOString()
  const nowISO = new Date().toISOString()

  const [ads, watchedToday] = await Promise.all([
    safeQuery(
      () =>
        adminSupabase
          .from("ptc_ads")
          .select("id, title, description, url, duration_seconds, reward_satoshis, total_views")
          .eq("is_active", true)
          .eq("is_approved", true)
          .gt("remaining_budget_satoshis", 0)
          .lte("start_date", nowISO)
          .or(`end_date.is.null,end_date.gt.${nowISO}`)
          .order("reward_satoshis", { ascending: false }),
      [],
    ) as Promise<PTCAd[]>,
    safeQuery(() => adminSupabase.from("ptc_views").select("ad_id").eq("user_id", userId).gte("created_at", todayISO), []),
  ])

  const watchedAdIds = new Set((watchedToday || []).map((v: any) => v.ad_id))

  const dbAds = (ads || []).filter((ad) => !watchedAdIds.has(ad.id))
  const availableAds = dbAds

  // Check if user watched all ads today
  const watchedAllToday = watchedAdIds.size > 0 && ads.length > 0 && watchedAdIds.size >= ads.length

  if (availableAds.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
        {watchedAllToday ? (
          <>
            <p className="text-base font-medium text-green-600">All ads watched for today!</p>
            <p className="text-sm mt-1">You&apos;ve completed all available PTC ads. Come back tomorrow for more!</p>
            <p className="text-xs mt-3 text-muted-foreground">
              Ads reset daily at midnight UTC
            </p>
          </>
        ) : (
          <>
            <p className="text-base font-medium">No ads available right now</p>
            <p className="text-sm mt-1">Check back later for new ads to watch!</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {availableAds.map((ad) => (
        <PTCAdCard key={ad.id} ad={ad} />
      ))}
    </div>
  )
}

async function WatchHistory({ userId }: { userId: string }) {
  const adminSupabase = requireAdminClient()

  const views = (await safeQuery(
    () =>
      adminSupabase
        .from("ptc_views")
        .select(`
        id,
        reward_satoshis,
        completed,
        created_at,
        ad:ptc_ads(title)
      `)
        .eq("user_id", userId)
        .eq("completed", true)
        .order("created_at", { ascending: false })
        .limit(20),
    [],
  )) as PTCView[]

  if (!views || views.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Eye className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No watch history yet</p>
        <p className="text-xs">Watch some ads to see your history here</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[350px]">
      <div className="space-y-2">
        {views.map((view) => (
          <div key={view.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">
                  {(Array.isArray(view.ad) ? view.ad[0]?.title : view.ad?.title) || "Advertisement"}
                </p>
                <p className="text-xs text-muted-foreground">{new Date(view.created_at).toLocaleString()}</p>
              </div>
            </div>
            <span className="font-bold text-sm text-green-500 flex-shrink-0">+{view.reward_satoshis} sats</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

export default async function PTCPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login?next=/dashboard/ptc")

  const userId = user.id

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Play className="h-6 w-6 sm:h-7 sm:w-7 text-green-500" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">PTC Ads</h1>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground">
          Watch advertisements and earn satoshis for your time
        </p>
      </div>

      {/* VPN Guard wraps earning content */}
      <OfferwallVPNGuard>
        {/* Info Alert */}
        <Alert className="border-green-500/30 bg-green-500/10">
          <AlertCircle className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-xs sm:text-sm">
            <strong>How it works:</strong> Click "Watch Ad" to open the advertisement. Stay on the page for the required
            time, then click "Claim Reward" to receive your satoshis!
          </AlertDescription>
        </Alert>

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
          <PTCStats userId={userId} />
        </Suspense>

        {/* Tabs */}
        <Tabs defaultValue="available" className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="available" className="text-xs sm:text-sm">
              <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
              Available Ads
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm">
              <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="mt-4 sm:mt-6">
            <Suspense
              fallback={
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-48" />
                  ))}
                </div>
              }
            >
              <AvailableAds userId={userId} />
            </Suspense>
          </TabsContent>

          <TabsContent value="history" className="mt-4 sm:mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Watch History</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Your recently watched advertisements</CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<Skeleton className="h-[350px]" />}>
                  <WatchHistory userId={userId} />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Partner Ads - 3x 60s static (separated from other networks per policy) */}
        <MultiNetworkAds position="footer" layout="grid" className="mt-6" />

        {/* Spacer to separate Google Ads from other networks per policy */}
        <div className="h-8" aria-hidden="true" />

        {/* Other 11 Ad Networks + c.cx.ua — the cx.ua slot now renders inline
            with the 11 partner networks for uniform impressions. */}
        <MultiNetworkAds position="footer" layout="grid" showLabels={false} />
      </OfferwallVPNGuard>
    </div>
  )
}

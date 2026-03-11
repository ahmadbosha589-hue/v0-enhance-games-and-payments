import { Suspense } from "react"
import Image from "next/image"
import { getUser, getProfile, safeQuery, createAdminClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Gift, ExternalLink, TrendingUp, Clock, Coins, CheckCircle2, AlertCircle, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { OfferwallVPNGuard } from "@/components/dashboard/offerwall-vpn-guard"

export const metadata = {
  title: "Offerwalls | CryptoFaucet",
  description: "Complete offers and surveys to earn satoshis",
}

interface OfferwallProvider {
  id: string
  name: string
  slug: string
  description: string
  logo_url: string
  is_enabled: boolean
  conversion_rate: number
  total_conversions: number
  total_paid_satoshis: number
}

interface OfferwallConversion {
  id: string
  offer_name: string
  payout_satoshis: number
  status: string
  created_at: string
  provider: {
    name: string
    slug: string
  }
}

function OfferwallsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    </div>
  )
}

async function OfferwallStats({ userId }: { userId: string }) {
  const adminSupabase = createAdminClient()

  const conversions = await safeQuery(
    () => adminSupabase.from("offerwall_conversions").select("payout_satoshis, status").eq("user_id", userId),
    [],
  )

  const approved = (conversions || []).filter((c: any) => c.status === "approved")
  const pending = (conversions || []).filter((c: any) => c.status === "pending")
  const totalEarned = approved.reduce((sum: number, c: any) => sum + (c.payout_satoshis || 0), 0)
  const pendingAmount = pending.reduce((sum: number, c: any) => sum + (c.payout_satoshis || 0), 0)

  const stats = [
    { label: "Total Earned", value: `${totalEarned.toLocaleString()} sats`, icon: Coins, color: "text-green-500" },
    { label: "Completed Offers", value: approved.length, icon: CheckCircle2, color: "text-blue-500" },
    { label: "Pending", value: `${pendingAmount.toLocaleString()} sats`, icon: Clock, color: "text-yellow-500" },
    { label: "Total Offers", value: (conversions || []).length, icon: Gift, color: "text-purple-500" },
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

async function OfferwallProviders({ userId }: { userId: string }) {
  const adminSupabase = createAdminClient()

  const providers = (await safeQuery(
    () =>
      adminSupabase
        .from("offerwall_providers")
        .select("*")
        .eq("is_enabled", true)
        .order("total_paid_satoshis", { ascending: false }),
    [],
  )) as OfferwallProvider[]

  if (!providers || providers.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No offerwalls are currently available. Please check back later.</AlertDescription>
      </Alert>
    )
  }

  const getProviderUrl = (slug: string) => {
    const urls: Record<string, string> = {
      "cpx-research": `https://offers.cpx-research.com/index.php?app_id=YOUR_APP_ID&ext_user_id=${userId}`,
      torox: `https://torox.io/offerwall/YOUR_APP_ID?user_id=${userId}`,
      lootably: `https://wall.lootably.com/YOUR_APP_ID?userId=${userId}`,
      adgate: `https://wall.adgaterewards.com/YOUR_APP_ID?userId=${userId}`,
      "mm-wall": `https://wall.make-money.app/YOUR_APP_ID?user_id=${userId}`,
      timewall: `https://timewall.io/YOUR_APP_ID?user_id=${userId}`,
      "offerwall-me": `https://offerwall.me/offerwall/YOUR_APP_ID?user_id=${userId}`,
      bicotasks: `https://bicotasks.com/offerwall/YOUR_APP_ID?user_id=${userId}`,
      adscend: `https://asmwall.com/YOUR_APP_ID?userId=${userId}`,
      bitlabs: `https://api.bitlabs.ai/v1/offers/${userId}?token=YOUR_APP_ID`,
      "ayet-studios": `https://www.ayetstudios.com/offers/web_offerwall/YOUR_APP_ID?external_identifier=${userId}`,
      "hang-my-ads": `https://www.hangmyads.com/offerwall/YOUR_APP_ID?user_id=${userId}`,
      notik: `https://notik.me/web/YOUR_APP_ID?userId=${userId}`,
    }
    return urls[slug] || "#"
  }

  return (
    <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {providers.map((provider) => (
        <Card
          key={provider.id}
          className="group hover:shadow-lg transition-all duration-300 hover:border-primary/50 overflow-hidden"
        >
          <CardHeader className="pb-2 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-10 sm:h-12 w-24 sm:w-32 relative bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                <Image
                  src={provider.logo_url || `/placeholder.svg?height=60&width=120&query=${encodeURIComponent(provider.name + ' logo')}`}
                  alt={provider.name}
                  width={120}
                  height={60}
                  className="object-contain"
                />
              </div>
              {provider.total_paid_satoshis > 100000 && (
                <Badge variant="secondary" className="text-[10px]">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Popular
                </Badge>
              )}
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg">{provider.name}</CardTitle>
              <CardDescription className="text-xs sm:text-sm line-clamp-2">{provider.description}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Total Paid:</span>
              <span className="font-medium text-green-500">{provider.total_paid_satoshis.toLocaleString()} sats</span>
            </div>
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Completions:</span>
              <span className="font-medium">{provider.total_conversions.toLocaleString()}</span>
            </div>
            <Button className="w-full gap-2 group-hover:gap-3 transition-all" size="sm" asChild>
              <a href={getProviderUrl(provider.slug)} target="_blank" rel="noopener noreferrer">
                View Offers
                <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

async function RecentConversions({ userId }: { userId: string }) {
  const adminSupabase = createAdminClient()

  const conversions = (await safeQuery(
    () =>
      adminSupabase
        .from("offerwall_conversions")
        .select(`
        id,
        offer_name,
        payout_satoshis,
        status,
        created_at,
        provider:offerwall_providers(name, slug)
      `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
    [],
  )) as OfferwallConversion[]

  if (!conversions || conversions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Gift className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm sm:text-base">No completed offers yet</p>
        <p className="text-xs sm:text-sm">Complete an offer from any offerwall to see it here</p>
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    approved: "bg-green-500/10 text-green-500 border-green-500/30",
    pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
    rejected: "bg-red-500/10 text-red-500 border-red-500/30",
    reversed: "bg-gray-500/10 text-gray-500 border-gray-500/30",
  }

  return (
    <ScrollArea className="h-[300px] sm:h-[400px]">
      <div className="space-y-3">
        {conversions.map((conversion) => (
          <div
            key={conversion.id}
            className="flex items-center justify-between p-3 sm:p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Gift className="h-4 w-4 text-purple-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{conversion.offer_name || "Offer Completed"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {conversion.provider?.name} • {new Date(conversion.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <Badge variant="outline" className={`text-[10px] sm:text-xs ${statusColors[conversion.status]}`}>
                {conversion.status}
              </Badge>
              <span className="font-bold text-sm sm:text-base text-green-500">
                +{conversion.payout_satoshis.toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

export default async function OfferwallsPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login?redirect=/dashboard/offerwalls")

  const profile = await getProfile(user.id)
  if (!profile) redirect("/auth/login?redirect=/dashboard/offerwalls")

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Gift className="h-6 w-6 sm:h-7 sm:w-7 text-purple-500" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Offerwalls</h1>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground">
          Complete surveys, download apps, and finish tasks to earn satoshis
        </p>
      </div>

      {/* VPN Guard wraps the main content */}
      <OfferwallVPNGuard>
        {/* Info Alert */}
        <Alert className="border-blue-500/30 bg-blue-500/10">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-xs sm:text-sm">
            <strong>How it works:</strong> Choose an offerwall, complete offers, and earn satoshis! Rewards are credited
            automatically after the advertiser confirms completion (usually 5-30 minutes).
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
          <OfferwallStats userId={user.id} />
        </Suspense>

        {/* Tabs */}
        <Tabs defaultValue="offerwalls" className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="offerwalls" className="text-xs sm:text-sm">
              <Gift className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
              Offerwalls
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm">
              <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="offerwalls" className="mt-4 sm:mt-6">
            <Suspense
              fallback={
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-64" />
                  ))}
                </div>
              }
            >
              <OfferwallProviders userId={user.id} />
            </Suspense>
          </TabsContent>

          <TabsContent value="history" className="mt-4 sm:mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Recent Completions</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Your recently completed offerwall tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<Skeleton className="h-[400px]" />}>
                  <RecentConversions userId={user.id} />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </OfferwallVPNGuard>
    </div>
  )
}

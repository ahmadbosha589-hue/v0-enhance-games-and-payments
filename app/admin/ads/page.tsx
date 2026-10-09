import { Suspense } from "react"
import type { Metadata } from "next"
import { getUser, getProfile, createAdminClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Monitor,
  DollarSign,
  Eye,
  MousePointer,
  Settings2,
  BarChart3,
  Lightbulb,
  CheckCircle2,
  Globe,
  Megaphone,
  Shield,
  Zap,
} from "lucide-react"
import { AdSettingsForm } from "@/components/admin/ad-settings-form"
import { AdNetworkSettings } from "@/components/admin/ad-network-settings"

export const metadata: Metadata = {
  title: "Ad Management | Admin",
  description: "Manage advertising networks and monetization",
}

export const dynamic = "force-dynamic"

interface AdSetting {
  id: string
  position: string
  provider: "aads" | "coinzilla" | "bitsmedia"
  enabled: boolean
  aads_id: string | null
  coinzilla_zone: string | null
  bitsmedia_id: string | null
  bitsmedia_slot: string | null
  impressions: number
  clicks: number
  revenue_satoshis: number
  created_at: string
  updated_at: string
}

async function AdStats() {
  try {
    const adminSupabase = createAdminClient()

    if (!adminSupabase) return <AdStatsEmpty />

    // Fetch from both old and new tables
    const [adsResult, networkConfigsResult] = await Promise.all([
      adminSupabase.from("ad_settings").select("*").order("position"),
      adminSupabase.from("ad_network_configs").select("*")
    ])

    const ads = adsResult.data || []
    const networkConfigs = networkConfigsResult.data || []

    const legacyActiveNetworks = ads.filter((ad) => ad.enabled).length
    const newActiveNetworks = networkConfigs.filter((n) => n.enabled).length
    const totalActiveNetworks = legacyActiveNetworks + newActiveNetworks
    const totalNetworks = 11

    const stats = [
      {
        label: "Available Networks",
        value: `${totalNetworks}`,
        icon: Globe,
        color: "text-blue-500",
        bg: "bg-blue-500/10",
      },
      {
        label: "Configured",
        value: `${ads.length + networkConfigs.length}`,
        icon: Settings2,
        color: "text-amber-500",
        bg: "bg-amber-500/10",
      },
      {
        label: "Active",
        value: `${totalActiveNetworks}`,
        icon: CheckCircle2,
        color: "text-green-500",
        bg: "bg-green-500/10",
      },
      {
        label: "Est. Revenue",
        value: "Tracking",
        icon: DollarSign,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
        note: "Per impression",
      },
    ]

    return (
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`p-2 sm:p-2.5 rounded-xl ${stat.bg} shrink-0`}>
                  <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stat.label}</p>
                  <p className="text-base sm:text-lg lg:text-2xl font-bold truncate">{stat.value}</p>
                  {stat.note && <p className="text-[9px] sm:text-xs text-muted-foreground">{stat.note}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  } catch (error) {
    console.error("AdStats error:", error)
    return <AdStatsEmpty />
  }
}

function AdStatsEmpty() {
  const stats = [
    { label: "Available Networks", value: "11", icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Configured", value: "0", icon: Settings2, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Active", value: "0", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "Est. Revenue", value: "$0", icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ]

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-border/50">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`p-2 sm:p-2.5 rounded-xl ${stat.bg} shrink-0`}>
                <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stat.label}</p>
                <p className="text-base sm:text-lg lg:text-2xl font-bold truncate">{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

async function ActiveNetworksList() {
  try {
    const adminSupabase = createAdminClient()

    if (!adminSupabase) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          Unable to connect to database.
        </div>
      )
    }

    const [adsResult, networkConfigsResult] = await Promise.all([
      adminSupabase.from("ad_settings").select("*").eq("enabled", true).order("position"),
      adminSupabase.from("ad_network_configs").select("*").eq("enabled", true)
    ])

    const ads = adsResult.data || []
    const networkConfigs = networkConfigsResult.data || []

    if (ads.length === 0 && networkConfigs.length === 0) {
      return (
        <div className="text-center py-8">
          <Globe className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">No active ad networks</p>
          <p className="text-sm text-muted-foreground mt-1">Go to the Networks tab to configure and enable ad networks</p>
        </div>
      )
    }

    const networkColors: Record<string, string> = {
      aads: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      coinzilla: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      bitsmedia: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      cointraffic: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      medianet: "bg-red-500/10 text-red-500 border-red-500/20",
      hilltopads: "bg-green-500/10 text-green-500 border-green-500/20",
      adsterra: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
      propellerads: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
      trafficstars: "bg-pink-500/10 text-pink-500 border-pink-500/20",
      adskeeper: "bg-teal-500/10 text-teal-500 border-teal-500/20",
    }

    const networkNames: Record<string, string> = {
      aads: "A-ADS",
      coinzilla: "CoinZilla",
      bitsmedia: "Bitmedia",
      cointraffic: "Cointraffic",
      medianet: "Media.net",
      hilltopads: "HilltopAds",
      adsterra: "Adsterra",
      propellerads: "PropellerAds",
      trafficstars: "TrafficStars",
      adskeeper: "AdsKeeper",
      a_ads: "A-ADS",
      mellowads: "MellowAds",
    }

    return (
      <div className="space-y-3">
        {/* Legacy ad settings */}
        {ads.map((ad: AdSetting) => (
          <Card key={ad.id} className="border-border/50">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted shrink-0">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm sm:text-base truncate">
                        {networkNames[ad.provider] || ad.provider}
                      </h3>
                      <Badge variant="outline" className={`${networkColors[ad.provider] || ""} text-[10px]`}>
                        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                        Active
                      </Badge>
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Position: {ad.position}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">Legacy</Badge>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* New network configs */}
        {networkConfigs.map((config) => (
          <Card key={config.id} className="border-border/50">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted shrink-0">
                    <Megaphone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm sm:text-base truncate">
                        {networkNames[config.network_id] || config.network_id}
                      </h3>
                      <Badge variant="outline" className={`${networkColors[config.network_id] || "bg-primary/10 text-primary border-primary/20"} text-[10px]`}>
                        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                        Active
                      </Badge>
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      Configured {new Date(config.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0 bg-green-500/10 text-green-500 border-green-500/20">
                  <Shield className="h-2.5 w-2.5 mr-1" />
                  Encrypted
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  } catch (error) {
    console.error("ActiveNetworksList error:", error)
    return (
      <div className="text-center py-8 text-muted-foreground">
        Unable to load active networks. Please try again later.
      </div>
    )
  }
}

function StatsSkeleton() {
  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 sm:p-6">
            <Skeleton className="h-12 sm:h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

async function getAdNetworkConfigs() {
  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) return {}

    const { data: configs } = await adminSupabase.from("ad_network_configs").select("*")

    const configMap: Record<string, { config: Record<string, string>; enabled: boolean }> = {}

    if (configs) {
      for (const config of configs) {
        configMap[config.network_id] = {
          config: { _configured: "true" },
          enabled: config.enabled
        }
      }
    }

    return configMap
  } catch {
    return {}
  }
}

export default async function AdminAdsPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login")

  const profile = await getProfile(user.id)
  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    redirect("/dashboard")
  }

  const networkConfigs = await getAdNetworkConfigs()

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Ad Network Management</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Configure and manage 11 advertising networks to maximize revenue
        </p>
      </div>

      {/* Feature highlights */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
              <Megaphone className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">11 Ad Networks</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">A-ADS, Coinzilla, Bitmedia & more</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 shrink-0">
              <Shield className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">AES-256 Encrypted</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Secure credential storage</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 shrink-0">
              <Zap className="h-4 w-4 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">Lazy Loading</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Optimized ad delivery</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <Suspense fallback={<StatsSkeleton />}>
        <AdStats />
      </Suspense>

      {/* Tabs for Settings and Overview */}
      <Tabs defaultValue="networks" className="space-y-4 sm:space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4 h-auto">
          <TabsTrigger value="networks" className="gap-1 sm:gap-2 text-xs sm:text-sm py-2">
            <Megaphone className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Networks</span>
            <span className="sm:hidden">Nets</span>
          </TabsTrigger>
          <TabsTrigger value="rewarded" className="gap-1 sm:gap-2 text-xs sm:text-sm py-2">
            <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Rewarded Ads</span>
            <span className="sm:hidden">Rewarded</span>
          </TabsTrigger>
          <TabsTrigger value="legacy" className="gap-1 sm:gap-2 text-xs sm:text-sm py-2">
            <Settings2 className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Legacy</span>
            <span className="sm:hidden">Old</span>
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-1 sm:gap-2 text-xs sm:text-sm py-2">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Overview</span>
            <span className="sm:hidden">View</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="networks" className="space-y-4 sm:space-y-6">
          <AdNetworkSettings initialConfigs={networkConfigs} />
        </TabsContent>

        <TabsContent value="rewarded" className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
                Partner Rewarded Ads Configuration
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Configure the 3 static 60-second rewarded ads that display on every page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-blue-500/20 bg-blue-500/5">
                <Lightbulb className="h-4 w-4" />
                <AlertTitle className="text-sm">How Rewarded Ads Work</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  Rewarded ads are 60-second video ads that users watch to earn bonus rewards.
                  Three ads run simultaneously on each page for maximum revenue.
                  Users can also watch ads to double their faucet claim rewards. These are served
                  by the 11 crypto-friendly partner networks (MultiNetworkAds), never by Google
                  AdSense - Google's Rewarded Ads policy prohibits tying AdSense creative to a
                  reward, so real AdSense only ever appears as a plain, non-incentivized banner
                  elsewhere on the site.
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((slot) => (
                  <Card key={slot} className="border-primary/20">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Eye className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">Rewarded Ad #{slot}</p>
                          <p className="text-[10px] text-muted-foreground">60 seconds duration</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Status</span>
                          <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-500 border-green-500/30">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                            Active
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Slot ID</span>
                          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                            PARTNER_ADS_SLOT_REWARDED_{slot}
                          </code>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Duration</span>
                          <span>60 seconds</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-medium text-sm mb-3">Ad Placement Settings</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Card className="border-muted">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Top Position</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">Header</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Shows rewarded ads at the top of pages
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-muted">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Bottom Position</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">Footer</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Shows rewarded ads at the bottom of pages
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Alert className="border-amber-500/20 bg-amber-500/5">
                <Zap className="h-4 w-4" />
                <AlertTitle className="text-sm">Double Reward Feature</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  Users can watch all 3 rewarded ads to double their faucet claim.
                  This feature is available under each cryptocurrency on the manual faucet page.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="legacy" className="space-y-4 sm:space-y-6">
          <Alert className="border-amber-500/20 bg-amber-500/5">
            <Lightbulb className="h-4 w-4" />
            <AlertTitle className="text-sm">Legacy Configuration</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              These are the original 3 ad networks (A-ADS, CoinZilla, Bitmedia). For new networks, use the Networks tab.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Settings2 className="h-4 w-4 sm:h-5 sm:w-5" />
                Legacy Ad Configuration
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Configure A-ADS, CoinZilla, and Bitmedia networks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdSettingsForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Active Networks</CardTitle>
              <CardDescription className="text-xs sm:text-sm">All currently enabled ad networks</CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-48 sm:h-64 w-full" />}>
                <ActiveNetworksList />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

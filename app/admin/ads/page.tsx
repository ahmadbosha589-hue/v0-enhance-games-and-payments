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
} from "lucide-react"
import { AdSettingsForm } from "@/components/admin/ad-settings-form"

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
    const { data: ads, error } = await adminSupabase.from("ad_settings").select("*").order("position")

    if (error) {
      console.error("AdStats error:", error)
      return <AdStatsEmpty />
    }

    const activeNetworks = ads?.filter((ad) => ad.enabled).length || 0
    const totalNetworks = ads?.length || 0

    const stats = [
      {
        label: "Active Networks",
        value: `${activeNetworks} / ${totalNetworks}`,
        icon: Globe,
        color: "text-green-500",
        bg: "bg-green-500/10",
      },
      {
        label: "Total Impressions",
        value: "0",
        icon: Eye,
        color: "text-blue-500",
        bg: "bg-blue-500/10",
        note: "Coming soon",
      },
      {
        label: "Total Clicks",
        value: "0",
        icon: MousePointer,
        color: "text-yellow-500",
        bg: "bg-yellow-500/10",
        note: "Coming soon",
      },
      {
        label: "Est. Revenue",
        value: "0 sats",
        icon: DollarSign,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
        note: "Coming soon",
      },
    ]

    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 sm:p-3 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">{stat.label}</p>
                  <p className="text-lg sm:text-2xl font-bold truncate">{stat.value}</p>
                  {stat.note && <p className="text-xs text-muted-foreground">{stat.note}</p>}
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
    {
      label: "Active Networks",
      value: "0",
      icon: Globe,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: "Total Impressions",
      value: "0",
      icon: Eye,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Total Clicks",
      value: "0",
      icon: MousePointer,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
    },
    {
      label: "Est. Revenue",
      value: "0 sats",
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
  ]

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-border/50">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 sm:p-3 rounded-xl ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{stat.label}</p>
                <p className="text-lg sm:text-2xl font-bold truncate">{stat.value}</p>
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
    const { data: ads, error } = await adminSupabase
      .from("ad_settings")
      .select("*")
      .eq("enabled", true)
      .order("position")

    if (error || !ads || ads.length === 0) {
      return (
        <div className="text-center py-8">
          <Globe className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">No active ad networks. Go to Settings to enable one.</p>
        </div>
      )
    }

    const networkColors: Record<string, string> = {
      aads: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      coinzilla: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      bitsmedia: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    }

    return (
      <div className="space-y-4">
        {ads.map((ad: AdSetting) => (
          <Card key={ad.id} className="border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Monitor className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{ad.provider === "aads" ? "A-ADS" : ad.provider === "coinzilla" ? "CoinZilla" : "Bitmedia"} — {ad.position}</h3>
                      <Badge variant="outline" className={networkColors[ad.provider] || ""}>
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Position: {ad.position}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">Config Status</p>
                    <p className="font-medium text-green-500">Configured</p>
                  </div>
                </div>
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
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default async function AdminAdsPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login")

  const profile = await getProfile(user.id)
  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Ad Network Management</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Configure and manage advertising networks to monetize your faucet
        </p>
      </div>

      {/* Getting Started Alert */}
      <Alert className="border-primary/20 bg-primary/5">
        <Lightbulb className="h-4 w-4" />
        <AlertTitle>Getting Started with Ads</AlertTitle>
        <AlertDescription className="mt-2 text-sm">
          <strong>Recommended networks for crypto faucets:</strong>
          <ul className="mt-2 space-y-1 ml-4 list-disc">
            <li>
              <strong>A-ADS</strong> - Bitcoin-focused, no KYC, instant payouts
            </li>
            <li>
              <strong>CoinZilla</strong> - Premium crypto ads with high CPM rates
            </li>
            <li>
              <strong>Bitmedia</strong> - Multiple ad formats, crypto payments
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Stats */}
      <Suspense fallback={<StatsSkeleton />}>
        <AdStats />
      </Suspense>

      {/* Tabs for Settings and Overview */}
      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="settings" className="gap-2">
            <Settings2 className="h-4 w-4" />
            <span>Settings</span>
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Overview</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Ad Network Configuration
              </CardTitle>
              <CardDescription>
                Add, configure, and manage your ad networks. Click "Add Ad Network" to get started, then follow the
                step-by-step instructions for each network.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdSettingsForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">Active Networks</CardTitle>
              <CardDescription>Overview of all currently active ad networks</CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <ActiveNetworksList />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

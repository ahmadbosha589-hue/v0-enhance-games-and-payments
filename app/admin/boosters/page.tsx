import { Suspense } from "react"
import type { Metadata } from "next"
import { getUser, getProfile, createAdminClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Rocket,
  Users,
  DollarSign,
  TrendingUp,
  Zap,
  Shield,
  Crown,
} from "lucide-react"
import { UserTierBadge, type UserTier } from "@/components/ui/user-tier-badge"

export const metadata: Metadata = {
  title: "Boosters Management | Admin",
  description: "Manage user boosters and subscription tiers",
}

export const dynamic = "force-dynamic"

async function BoosterStats() {
  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) return null
    
    // Get booster statistics
    const { data: boosters } = await adminSupabase
      .from("user_boosters")
      .select("tier, is_active, amount_paid_usd")
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
    
    const activeCount = boosters?.length || 0
    const tierCounts = boosters?.reduce((acc, b) => {
      const key = b.tier || "unassigned"
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>) || {}

    const stats = [
      {
        label: "Active Boosters",
        value: activeCount.toString(),
        icon: Rocket,
        color: "text-blue-500",
        bg: "bg-blue-500/10",
      },
      {
        label: "Basic Tier",
        value: (tierCounts.basic || 0).toString(),
        icon: Zap,
        color: "text-blue-500",
        bg: "bg-blue-500/10",
      },
      {
        label: "Pro Tier",
        value: (tierCounts.pro || 0).toString(),
        icon: Shield,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
      },
      {
        label: "Elite/Legend",
        value: ((tierCounts.elite || 0) + (tierCounts.legend || 0)).toString(),
        icon: Crown,
        color: "text-amber-500",
        bg: "bg-amber-500/10",
      },
    ]

    return (
      <>
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
        
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Active Booster Value</p>
                <p className="text-xs text-muted-foreground">USD paid for currently active boosters</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-green-500">
              ${((boosters || []) as { amount_paid_usd?: number | null }[]).reduce((sum, b) => sum + (b.amount_paid_usd || 0), 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </>
    )
  } catch (error) {
    console.error("BoosterStats error:", error)
    return null
  }
}

async function ActiveBoostersList() {
  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          Unable to connect to database.
        </div>
      )
    }
    
    // NOTE: profiles has no `email` column (emails live in auth.users), so the
    // old embed errored on every load and the page always showed "No active
    // boosters". Select only columns that exist.
    const { data: boosters, error } = await adminSupabase
      .from("user_boosters")
      .select(`
        *,
        profiles!user_boosters_user_id_fkey (
          username,
          display_name,
          faucetpay_email
        )
      `)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("[AdminBoosters] query failed:", error)
      return (
        <div className="text-center py-8 text-destructive">
          Failed to load boosters. Check server logs.
        </div>
      )
    }

    if (!boosters || boosters.length === 0) {
      return (
        <div className="text-center py-8">
          <Rocket className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">No active boosters</p>
          <p className="text-sm text-muted-foreground mt-1">Users can purchase boosters from the Boosters page</p>
        </div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boosters.map((booster: any) => (
              <TableRow key={booster.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">
                      {booster.profiles?.display_name || booster.profiles?.username || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {booster.profiles?.faucetpay_email || "—"}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  {booster.tier ? (
                    <UserTierBadge tier={booster.tier as UserTier} size="sm" />
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      unassigned
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {booster.payment_method || "Unknown"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <p className="text-sm">
                    {new Date(booster.expires_at).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Math.ceil((new Date(booster.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days left
                  </p>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {typeof booster.amount_paid_usd === "number" && booster.amount_paid_usd > 0
                    ? `$${booster.amount_paid_usd.toFixed(2)}`
                    : booster.amount_paid_satoshis
                      ? `${booster.amount_paid_satoshis.toLocaleString()} sats`
                      : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  } catch (error) {
    console.error("ActiveBoostersList error:", error)
    return (
      <div className="text-center py-8 text-muted-foreground">
        Unable to load active boosters. Please try again later.
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

export default async function AdminBoostersPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login")

  const profile = await getProfile(user.id)
  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Boosters Management</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          View and manage user booster subscriptions
        </p>
      </div>

      {/* Tier overview */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-blue-500" />
              <span className="font-semibold text-sm">Basic</span>
            </div>
            <p className="text-xs text-muted-foreground">$5 • 7 days</p>
            <p className="text-xs text-muted-foreground">100% faucet • 10% offerwall</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <Rocket className="h-4 w-4 text-emerald-500" />
              <span className="font-semibold text-sm">Pro</span>
            </div>
            <p className="text-xs text-muted-foreground">$10 • 15 days</p>
            <p className="text-xs text-muted-foreground">200% faucet • 20% offerwall</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-amber-500" />
              <span className="font-semibold text-sm">Elite</span>
            </div>
            <p className="text-xs text-muted-foreground">$20 • 30 days</p>
            <p className="text-xs text-muted-foreground">300% faucet • 35% offerwall</p>
          </CardContent>
        </Card>
        <Card className="border-fuchsia-500/20 bg-fuchsia-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="h-4 w-4 text-fuchsia-500" />
              <span className="font-semibold text-sm">Legend</span>
            </div>
            <p className="text-xs text-muted-foreground">$50 • 30 days</p>
            <p className="text-xs text-muted-foreground">500% faucet • 50% offerwall</p>
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <Suspense fallback={<StatsSkeleton />}>
        <BoosterStats />
      </Suspense>

      {/* Active boosters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Active Boosters</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Users with currently active booster subscriptions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-48 sm:h-64 w-full" />}>
            <ActiveBoostersList />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}

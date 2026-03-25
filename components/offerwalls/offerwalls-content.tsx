"use client"

import { useState } from "react"
import useSWR from "swr"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Gift, ExternalLink, TrendingUp, Clock, Coins, CheckCircle2,
  AlertCircle, Star, Users, Zap, Sparkles
} from "lucide-react"
import { cn } from "@/lib/utils"

interface OfferwallsContentProps {
  userId: string
}

interface OfferwallData {
  id: string
  name: string
  slug: string
  description: string
  logo: string
  color: string
  bgGradient: string
  minPayout: number
  conversionRate: number
  features: string[]
  url: string
  active: boolean
  priority: number
  stats: {
    total_paid: number
    completion_count: number
    user_earnings: number
    user_completions: number
  } | null
}

interface PlatformStats {
  total_paid_all_offerwalls: number
  total_completions: number
  active_offerwalls: number
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function StatsCards({ platformStats, userStats }: {
  platformStats: PlatformStats | null
  userStats: { total_earned: number; total_completions: number }
}) {
  const stats = [
    {
      label: "Your Earnings",
      value: `${userStats.total_earned.toLocaleString()} sats`,
      icon: Coins,
      color: "text-green-500",
      bgColor: "bg-green-500/10"
    },
    {
      label: "Your Completions",
      value: userStats.total_completions.toString(),
      icon: CheckCircle2,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10"
    },
    {
      label: "Platform Total Paid",
      value: `${(platformStats?.total_paid_all_offerwalls || 0).toLocaleString()} sats`,
      icon: TrendingUp,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10"
    },
    {
      label: "Active Offerwalls",
      value: (platformStats?.active_offerwalls || 0).toString(),
      icon: Gift,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10"
    },
  ]

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-border/50">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={cn("p-1.5 sm:p-2 rounded-lg", stat.bgColor)}>
                <stat.icon className={cn("h-4 w-4 sm:h-5 sm:w-5", stat.color)} />
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

function OfferwallCard({ offerwall, userId }: { offerwall: OfferwallData; userId: string }) {
  // Replace placeholders in URL
  const getOfferwallUrl = () => {
    return offerwall.url
      .replace("{user_id}", userId)
      .replace("{app_id}", "YOUR_APP_ID")
      .replace("{pub_id}", "YOUR_PUB_ID")
      .replace("{wall_code}", "YOUR_WALL_CODE")
      .replace("{placement_id}", "YOUR_PLACEMENT_ID")
      .replace("{api_token}", "YOUR_API_TOKEN")
      .replace("{api_key}", "YOUR_API_KEY")
      .replace("{adslot_id}", "YOUR_ADSLOT_ID")
  }

  const totalPaid = offerwall.stats?.total_paid || 0
  const isPopular = totalPaid > 50000

  return (
    <Card
      className={cn(
        "group hover:shadow-lg transition-all duration-300 hover:border-primary/50 overflow-hidden",
        `border-l-4`
      )}
      style={{ borderLeftColor: offerwall.color }}
    >
      <CardHeader className="pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <div
            className={cn(
              "h-12 w-32 relative rounded-lg overflow-hidden flex items-center justify-center p-2",
              "bg-gradient-to-br",
              offerwall.bgGradient
            )}
          >
            <span className="font-bold text-sm" style={{ color: offerwall.color }}>
              {offerwall.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {isPopular && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <TrendingUp className="h-3 w-3" />
                Popular
              </Badge>
            )}
          </div>
        </div>
        <div>
          <CardTitle className="text-base sm:text-lg">{offerwall.name}</CardTitle>
          <CardDescription className="text-xs sm:text-sm line-clamp-2">
            {offerwall.description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Features */}
        <div className="flex flex-wrap gap-1">
          {offerwall.features.slice(0, 3).map((feature) => (
            <Badge key={feature} variant="outline" className="text-[10px]">
              {feature}
            </Badge>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
            <span className="text-muted-foreground">Total Paid:</span>
            <span className="font-medium text-green-500">
              {totalPaid.toLocaleString()} sats
            </span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
            <span className="text-muted-foreground">Completions:</span>
            <span className="font-medium">
              {(offerwall.stats?.completion_count || 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* User's earnings from this offerwall */}
        {(offerwall.stats?.user_earnings || 0) > 0 && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <Star className="h-3 w-3" />
              Your Earnings:
            </span>
            <span className="text-sm font-bold text-green-500">
              {offerwall.stats?.user_earnings.toLocaleString()} sats
            </span>
          </div>
        )}

        <Button className="w-full gap-2 group-hover:gap-3 transition-all" size="sm" asChild>
          <a href={getOfferwallUrl()} target="_blank" rel="noopener noreferrer">
            <Zap className="h-3.5 w-3.5" />
            View Offers
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}

function OfferwallsGrid({ offerwalls, userId }: { offerwalls: OfferwallData[]; userId: string }) {
  if (!offerwalls || offerwalls.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold mb-2">No Offerwalls Available</h3>
        <p className="text-sm text-muted-foreground">
          Please check back later for available offerwalls.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {offerwalls.map((offerwall) => (
        <OfferwallCard key={offerwall.id} offerwall={offerwall} userId={userId} />
      ))}
    </div>
  )
}

function RecentCompletions({ userId }: { userId: string }) {
  // This would fetch from a conversions endpoint
  // For now, show a placeholder
  return (
    <div className="text-center py-8 text-muted-foreground">
      <Gift className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 opacity-50" />
      <p className="text-sm sm:text-base">No completed offers yet</p>
      <p className="text-xs sm:text-sm">Complete an offer from any offerwall to see it here</p>
    </div>
  )
}

export function OfferwallsContent({ userId }: OfferwallsContentProps) {
  const { data, isLoading, error } = useSWR(
    `/api/offerwalls?stats=true`,
    fetcher,
    { refreshInterval: 60000 }
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500/50" />
        <h3 className="text-lg font-semibold mb-2">Failed to Load Offerwalls</h3>
        <p className="text-sm text-muted-foreground">
          Please try again later.
        </p>
      </div>
    )
  }

  const offerwalls: OfferwallData[] = data?.offerwalls || []
  const platformStats: PlatformStats = data?.platformStats || {
    total_paid_all_offerwalls: 0,
    total_completions: 0,
    active_offerwalls: 0,
  }

  // Calculate user stats from offerwall data
  const userStats = {
    total_earned: offerwalls.reduce((sum, o) => sum + (o.stats?.user_earnings || 0), 0),
    total_completions: offerwalls.reduce((sum, o) => sum + (o.stats?.user_completions || 0), 0),
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <StatsCards platformStats={platformStats} userStats={userStats} />

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
          {/* Featured banner */}
          <Card className="mb-6 border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-yellow-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-500/20 shrink-0">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="font-semibold text-amber-600 dark:text-amber-400">
                    Earn More with Tournaments!
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Your offerwall earnings count towards the Offerwall Master tournament. Complete offers to climb the leaderboard!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <OfferwallsGrid offerwalls={offerwalls} userId={userId} />
        </TabsContent>

        <TabsContent value="history" className="mt-4 sm:mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Recent Completions</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Your recently completed offerwall tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RecentCompletions userId={userId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

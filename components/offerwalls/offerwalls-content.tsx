"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  Gift, ExternalLink, TrendingUp, Clock, Coins, CheckCircle2,
  AlertCircle, Star, Users, Zap, Sparkles, Trophy, Target,
  ArrowRight, Flame, Award
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
      value: userStats.total_earned,
      formatted: `${userStats.total_earned.toLocaleString()} sats`,
      icon: Coins,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20"
    },
    {
      label: "Completions",
      value: userStats.total_completions,
      formatted: userStats.total_completions.toString(),
      icon: CheckCircle2,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20"
    },
    {
      label: "Total Paid Out",
      value: platformStats?.total_paid_all_offerwalls || 0,
      formatted: `${((platformStats?.total_paid_all_offerwalls || 0) / 1000).toFixed(1)}k sats`,
      icon: TrendingUp,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20"
    },
    {
      label: "Active Walls",
      value: platformStats?.active_offerwalls || 0,
      formatted: (platformStats?.active_offerwalls || 0).toString(),
      icon: Gift,
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/10",
      borderColor: "border-cyan-500/20"
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className={cn("border-border/50 hover:shadow-md transition-all duration-200", stat.borderColor)}>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className={cn("p-2 sm:p-2.5 rounded-xl shrink-0", stat.bgColor)}>
                <stat.icon className={cn("h-4 w-4 sm:h-5 sm:w-5", stat.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stat.label}</p>
                <p className="text-sm sm:text-lg font-bold truncate">{stat.formatted}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function OfferwallCard({ offerwall, userId }: { offerwall: OfferwallData; userId: string }) {
  const getOfferwallUrl = () => {
    return offerwall.url
      .replace("{user_id}", userId)
      .replace("{app_id}", process.env.NEXT_PUBLIC_CPX_APP_ID || "")
      .replace("{pub_id}", process.env.NEXT_PUBLIC_TOROX_PUB_ID || "")
      .replace("{wall_code}", process.env.NEXT_PUBLIC_ADGATE_WALL_CODE || "")
      .replace("{placement_id}", process.env.NEXT_PUBLIC_LOOTABLY_PLACEMENT_ID || "")
      .replace("{api_token}", process.env.NEXT_PUBLIC_BITLABS_TOKEN || "")
      .replace("{api_key}", process.env.NEXT_PUBLIC_TIMEWALL_KEY || "")
      .replace("{adslot_id}", process.env.NEXT_PUBLIC_AYET_ADSLOT || "")
      .replace("{player_id}", process.env.NEXT_PUBLIC_ADGEM_PLAYER_ID || "")
  }

  const totalPaid = offerwall.stats?.total_paid || 0
  const userEarnings = offerwall.stats?.user_earnings || 0
  const completions = offerwall.stats?.completion_count || 0
  const isPopular = totalPaid > 50000 || completions > 100
  const isHot = totalPaid > 100000

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-300 flex flex-col h-full",
        "hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1",
        "border-l-4"
      )}
      style={{ borderLeftColor: offerwall.color }}
    >
      {/* Gradient overlay on hover */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ 
          background: `linear-gradient(135deg, ${offerwall.color}08 0%, transparent 50%)` 
        }}
      />
      
      <CardHeader className="pb-2 sm:pb-3 relative flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "h-10 sm:h-11 px-3 sm:px-4 relative rounded-lg overflow-hidden flex items-center justify-center",
              "bg-gradient-to-br shadow-sm",
              offerwall.bgGradient
            )}
          >
            <span 
              className="font-bold text-[11px] sm:text-xs whitespace-nowrap" 
              style={{ color: offerwall.color }}
            >
              {offerwall.name}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isHot && (
              <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 text-[9px] sm:text-[10px] gap-0.5 px-1.5 py-0.5">
                <Flame className="h-2.5 w-2.5" />
                Hot
              </Badge>
            )}
            {isPopular && !isHot && (
              <Badge variant="secondary" className="text-[9px] sm:text-[10px] gap-0.5 px-1.5 py-0.5">
                <TrendingUp className="h-2.5 w-2.5" />
                Top
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-2">
          <CardTitle className="text-sm sm:text-base leading-tight">{offerwall.name}</CardTitle>
          <CardDescription className="text-[11px] sm:text-xs mt-0.5 line-clamp-2">
            {offerwall.description}
          </CardDescription>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 sm:space-y-3 relative flex-1 flex flex-col">
        {/* Features - compact badges */}
        <div className="flex flex-wrap gap-1">
          {offerwall.features.slice(0, 3).map((feature) => (
            <Badge 
              key={feature} 
              variant="outline" 
              className="text-[9px] sm:text-[10px] px-1.5 py-0 font-normal h-5"
            >
              {feature}
            </Badge>
          ))}
        </div>

        {/* Stats grid - more compact */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <div className="flex flex-col p-2 rounded-md bg-muted/50 border border-border/50">
            <span className="text-[9px] sm:text-[10px] text-muted-foreground">Paid</span>
            <span className="text-xs sm:text-sm font-semibold text-green-500">
              {totalPaid >= 1000 ? `${(totalPaid / 1000).toFixed(0)}k` : totalPaid}
            </span>
          </div>
          <div className="flex flex-col p-2 rounded-md bg-muted/50 border border-border/50">
            <span className="text-[9px] sm:text-[10px] text-muted-foreground">Done</span>
            <span className="text-xs sm:text-sm font-semibold">
              {completions >= 1000 ? `${(completions / 1000).toFixed(0)}k` : completions}
            </span>
          </div>
        </div>

        {/* User earnings highlight - compact */}
        {userEarnings > 0 && (
          <div className="flex items-center justify-between p-2 rounded-md bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/20">
            <span className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <Award className="h-3 w-3" />
              Earned
            </span>
            <span className="text-xs sm:text-sm font-bold text-green-500">
              {userEarnings >= 1000 ? `${(userEarnings / 1000).toFixed(1)}k` : userEarnings}
            </span>
          </div>
        )}

        {/* Spacer to push button to bottom */}
        <div className="flex-1" />

        <Button 
          className="w-full gap-1.5 sm:gap-2 group/btn transition-all mt-auto" 
          size="sm" 
          asChild
        >
          <a href={getOfferwallUrl()} target="_blank" rel="noopener noreferrer">
            <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-sm">View Offers</span>
            <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}

function OfferwallsGrid({ offerwalls, userId }: { offerwalls: OfferwallData[]; userId: string }) {
  if (!offerwalls || offerwalls.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16">
          <div className="p-4 rounded-full bg-muted/50 mb-4">
            <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/50" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold mb-2">No Offerwalls Available</h3>
          <p className="text-xs sm:text-sm text-muted-foreground text-center max-w-sm">
            Please check back later for available offerwalls. New offers are added regularly.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {offerwalls.map((offerwall) => (
        <OfferwallCard key={offerwall.id} offerwall={offerwall} userId={userId} />
      ))}
    </div>
  )
}

function RecentCompletions({ userId }: { userId: string }) {
  const { data, isLoading } = useSWR(
    `/api/transactions?type=offerwall&limit=5`,
    fetcher,
    { refreshInterval: 60000 }
  )

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  }

  const completions = data?.transactions || []

  if (completions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 sm:py-12 text-center">
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <Gift className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/40" />
        </div>
        <p className="text-sm sm:text-base font-medium mb-1">No completed offers yet</p>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-xs">
          Complete an offer from any offerwall to see your history here
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {completions.map((completion: any) => (
        <div 
          key={completion.id} 
          className="flex items-center justify-between p-3 sm:p-4 rounded-lg bg-muted/30 border border-border/50 hover:border-border transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-green-500/10 shrink-0">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{completion.description || "Offer Completed"}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(completion.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-green-600 bg-green-500/10 shrink-0 ml-2">
            +{completion.amount_satoshis?.toLocaleString() || completion.amount?.toLocaleString()} sats
          </Badge>
        </div>
      ))}
    </div>
  )
}

function LaunchBonusBanner() {
  const launchEndDate = new Date()
  launchEndDate.setDate(launchEndDate.getDate() + 7)
  
  return (
    <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-orange-500/10 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-500/20 to-transparent rounded-bl-full" />
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-2.5 sm:p-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 shrink-0">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-amber-600 dark:text-amber-400 text-sm sm:text-base">
                Launch Bonus Active!
              </p>
              <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px]">
                +10% All Earnings
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Celebrate our launch with 10% bonus on all offerwall earnings. Limited time only!
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TournamentBanner() {
  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 overflow-hidden relative">
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-gradient-to-bl from-primary/10 to-transparent rounded-full" />
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-2.5 sm:p-3 rounded-xl bg-primary/10 shrink-0">
            <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm sm:text-base">
              Offerwall Master Tournament
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Your offerwall earnings count towards daily, weekly, and monthly tournaments. Complete offers to climb the leaderboard and win prizes!
            </p>
            <Button variant="link" className="p-0 h-auto text-xs sm:text-sm mt-1" asChild>
              <a href="/dashboard/tournaments">
                View Tournaments <ArrowRight className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function OfferwallsContent({ userId }: OfferwallsContentProps) {
  const [activeTab, setActiveTab] = useState("offerwalls")
  
  const { data, isLoading, error } = useSWR(
    `/api/offerwalls?stats=true`,
    fetcher,
    { 
      refreshInterval: 60000,
      revalidateOnFocus: false,
      dedupingInterval: 30000
    }
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 sm:h-24" />
          ))}
        </div>
        <Skeleton className="h-24" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16">
          <div className="p-4 rounded-full bg-destructive/10 mb-4">
            <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-destructive/70" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold mb-2">Failed to Load Offerwalls</h3>
          <p className="text-xs sm:text-sm text-muted-foreground text-center mb-4">
            There was an error loading offerwalls. Please try again.
          </p>
          <Button onClick={() => window.location.reload()} variant="outline" size="sm">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const offerwalls: OfferwallData[] = data?.offerwalls || []
  const platformStats: PlatformStats = data?.platformStats || {
    total_paid_all_offerwalls: 0,
    total_completions: 0,
    active_offerwalls: 0,
  }

  const userStats = {
    total_earned: offerwalls.reduce((sum, o) => sum + (o.stats?.user_earnings || 0), 0),
    total_completions: offerwalls.reduce((sum, o) => sum + (o.stats?.user_completions || 0), 0),
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Stats */}
      <StatsCards platformStats={platformStats} userStats={userStats} />

      {/* Launch Bonus Banner */}
      <LaunchBonusBanner />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-5">
        <TabsList className="grid w-full grid-cols-2 max-w-sm h-10 sm:h-11">
          <TabsTrigger value="offerwalls" className="text-xs sm:text-sm gap-1.5">
            <Gift className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Offerwalls
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm gap-1.5">
            <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="offerwalls" className="mt-4 sm:mt-5 space-y-5">
          {/* Tournament Banner */}
          <TournamentBanner />

          {/* Offerwalls Grid */}
          <OfferwallsGrid offerwalls={offerwalls} userId={userId} />
        </TabsContent>

        <TabsContent value="history" className="mt-4 sm:mt-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                Recent Completions
              </CardTitle>
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

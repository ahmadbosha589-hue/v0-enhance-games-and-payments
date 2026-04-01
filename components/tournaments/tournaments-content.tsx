"use client"

import { useState, useEffect, useMemo } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import {
  Crown, Trophy, Users, Clock, Coins, Zap, Target,
  TrendingUp, Medal, Calendar, Gift, Droplets, ShoppingBag,
  ChevronRight, Star, Sparkles, Timer, Award, ArrowRight
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TournamentsContentProps {
  userId: string
}

type TournamentPeriod = "daily" | "weekly" | "monthly"
type TournamentType = "faucet_claims" | "offerwall_earnings" | "highest_earners"

interface LeaderboardEntry {
  user_id: string
  username: string
  avatar_url: string | null
  score: number
  rank: number
  is_current_user: boolean
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const TOURNAMENT_TYPES: { type: TournamentType; name: string; icon: typeof Droplets; color: string; bgColor: string; gradient: string }[] = [
  { 
    type: "faucet_claims", 
    name: "Faucet Champion", 
    icon: Droplets, 
    color: "text-blue-500", 
    bgColor: "bg-blue-500/10",
    gradient: "from-blue-500 to-cyan-400"
  },
  { 
    type: "offerwall_earnings", 
    name: "Offerwall Master", 
    icon: ShoppingBag, 
    color: "text-emerald-500", 
    bgColor: "bg-emerald-500/10",
    gradient: "from-emerald-500 to-teal-400"
  },
  { 
    type: "highest_earners", 
    name: "Top Earner", 
    icon: TrendingUp, 
    color: "text-amber-500", 
    bgColor: "bg-amber-500/10",
    gradient: "from-amber-500 to-orange-400"
  },
]

const PERIODS: { period: TournamentPeriod; name: string; shortName: string; icon: typeof Calendar }[] = [
  { period: "daily", name: "Daily", shortName: "24h", icon: Timer },
  { period: "weekly", name: "Weekly", shortName: "7d", icon: Calendar },
  { period: "monthly", name: "Monthly", shortName: "30d", icon: Trophy },
]

// Lowered prize pools suitable for a new starter crypto faucet
const PRIZE_CONFIGS: Record<TournamentPeriod, Record<TournamentType, { prize_pool: number; prizes: { rank: number; percentage: number }[] }>> = {
  daily: {
    faucet_claims: { 
      prize_pool: 500, // 500 sats daily
      prizes: [
        { rank: 1, percentage: 50 }, 
        { rank: 2, percentage: 30 }, 
        { rank: 3, percentage: 20 }
      ] 
    },
    offerwall_earnings: { 
      prize_pool: 1000, // 1000 sats daily
      prizes: [
        { rank: 1, percentage: 50 }, 
        { rank: 2, percentage: 30 }, 
        { rank: 3, percentage: 20 }
      ] 
    },
    highest_earners: { 
      prize_pool: 1500, // 1500 sats daily
      prizes: [
        { rank: 1, percentage: 50 }, 
        { rank: 2, percentage: 30 }, 
        { rank: 3, percentage: 20 }
      ] 
    },
  },
  weekly: {
    faucet_claims: { 
      prize_pool: 2500, // 2500 sats weekly
      prizes: [
        { rank: 1, percentage: 40 }, 
        { rank: 2, percentage: 25 }, 
        { rank: 3, percentage: 15 }, 
        { rank: 4, percentage: 10 }, 
        { rank: 5, percentage: 10 }
      ] 
    },
    offerwall_earnings: { 
      prize_pool: 5000, // 5000 sats weekly
      prizes: [
        { rank: 1, percentage: 40 }, 
        { rank: 2, percentage: 25 }, 
        { rank: 3, percentage: 15 }, 
        { rank: 4, percentage: 10 }, 
        { rank: 5, percentage: 10 }
      ] 
    },
    highest_earners: { 
      prize_pool: 7500, // 7500 sats weekly
      prizes: [
        { rank: 1, percentage: 40 }, 
        { rank: 2, percentage: 25 }, 
        { rank: 3, percentage: 15 }, 
        { rank: 4, percentage: 10 }, 
        { rank: 5, percentage: 10 }
      ] 
    },
  },
  monthly: {
    faucet_claims: { 
      prize_pool: 10000, // 10k sats monthly
      prizes: [
        { rank: 1, percentage: 35 }, 
        { rank: 2, percentage: 20 }, 
        { rank: 3, percentage: 15 }, 
        { rank: 4, percentage: 10 }, 
        { rank: 5, percentage: 8 }, 
        { rank: 6, percentage: 5 }, 
        { rank: 7, percentage: 4 }, 
        { rank: 8, percentage: 3 }
      ] 
    },
    offerwall_earnings: { 
      prize_pool: 20000, // 20k sats monthly
      prizes: [
        { rank: 1, percentage: 35 }, 
        { rank: 2, percentage: 20 }, 
        { rank: 3, percentage: 15 }, 
        { rank: 4, percentage: 10 }, 
        { rank: 5, percentage: 8 }, 
        { rank: 6, percentage: 5 }, 
        { rank: 7, percentage: 4 }, 
        { rank: 8, percentage: 3 }
      ] 
    },
    highest_earners: { 
      prize_pool: 30000, // 30k sats monthly
      prizes: [
        { rank: 1, percentage: 35 }, 
        { rank: 2, percentage: 20 }, 
        { rank: 3, percentage: 15 }, 
        { rank: 4, percentage: 10 }, 
        { rank: 5, percentage: 8 }, 
        { rank: 6, percentage: 5 }, 
        { rank: 7, percentage: 4 }, 
        { rank: 8, percentage: 3 }
      ] 
    },
  },
}

function getPeriodDates(period: TournamentPeriod): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)

  switch (period) {
    case "daily":
      start.setUTCHours(0, 0, 0, 0)
      end.setUTCHours(23, 59, 59, 999)
      break
    case "weekly":
      const dayOfWeek = now.getUTCDay()
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      start.setUTCDate(now.getUTCDate() + diffToMonday)
      start.setUTCHours(0, 0, 0, 0)
      end.setUTCDate(start.getUTCDate() + 6)
      end.setUTCHours(23, 59, 59, 999)
      break
    case "monthly":
      start.setUTCDate(1)
      start.setUTCHours(0, 0, 0, 0)
      end.setUTCMonth(end.getUTCMonth() + 1, 0)
      end.setUTCHours(23, 59, 59, 999)
      break
  }

  return { start, end }
}

function getTimeRemaining(endDate: Date): { text: string; percentage: number } {
  const now = new Date()
  const diff = endDate.getTime() - now.getTime()

  if (diff <= 0) return { text: "Ended", percentage: 100 }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  let text: string
  if (days > 0) text = `${days}d ${hours}h`
  else if (hours > 0) text = `${hours}h ${minutes}m`
  else text = `${minutes}m`

  // Calculate percentage of time passed
  const { start, end } = getPeriodDates(days > 6 ? "monthly" : days > 0 ? "weekly" : "daily")
  const totalDuration = end.getTime() - start.getTime()
  const elapsed = now.getTime() - start.getTime()
  const percentage = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100))

  return { text, percentage }
}

function TournamentCard({
  type,
  period,
  userId
}: {
  type: TournamentType
  period: TournamentPeriod
  userId: string
}) {
  const typeConfig = TOURNAMENT_TYPES.find((t) => t.type === type)!
  const prizeConfig = PRIZE_CONFIGS[period][type]
  const { end } = getPeriodDates(period)
  const [timeInfo, setTimeInfo] = useState(getTimeRemaining(end))

  const { data, isLoading } = useSWR(
    `/api/tournaments/leaderboard?type=${type}&period=${period}&limit=10`,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: false }
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeInfo(getTimeRemaining(end))
    }, 60000)
    return () => clearInterval(interval)
  }, [end])

  const leaderboard: LeaderboardEntry[] = data?.leaderboard || []
  const userPosition = data?.userPosition

  const getScoreLabel = () => {
    if (type === "faucet_claims") return "claims"
    return "sats"
  }

  const getRankBadge = (rank: number) => {
    if (rank === 1) return (
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-sm">
        <Crown className="h-3.5 w-3.5 text-white" />
      </div>
    )
    if (rank === 2) return (
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center shadow-sm">
        <Medal className="h-3.5 w-3.5 text-white" />
      </div>
    )
    if (rank === 3) return (
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center shadow-sm">
        <Medal className="h-3.5 w-3.5 text-white" />
      </div>
    )
    return (
      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
        <span className="text-[10px] font-semibold text-muted-foreground">#{rank}</span>
      </div>
    )
  }

  const getPrizeAmount = (rank: number) => {
    const prize = prizeConfig.prizes.find((p) => p.rank === rank)
    if (!prize) return null
    return Math.floor(prizeConfig.prize_pool * prize.percentage / 100)
  }

  const periodLabel = period === "daily" ? "Daily" : period === "weekly" ? "Weekly" : "Monthly"

  return (
    <Card className="overflow-hidden border-border/50 hover:shadow-lg transition-all duration-300">
      {/* Header gradient */}
      <div className={cn("h-1.5 w-full bg-gradient-to-r", typeConfig.gradient)} />

      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className={cn("p-2 sm:p-2.5 rounded-xl", typeConfig.bgColor)}>
              <typeConfig.icon className={cn("h-4 w-4 sm:h-5 sm:w-5", typeConfig.color)} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm sm:text-base leading-tight truncate">
                {periodLabel} {typeConfig.name}
              </CardTitle>
              <CardDescription className="text-[10px] sm:text-xs mt-0.5">
                {type === "faucet_claims" ? "Most claims" :
                  type === "offerwall_earnings" ? "Highest offerwall earnings" :
                    "Highest total earnings"}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px] sm:text-xs gap-1 px-2">
            <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            {timeInfo.text}
          </Badge>
        </div>

        {/* Time progress */}
        <Progress value={timeInfo.percentage} className="h-1" />
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Prize pool */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-yellow-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-amber-500" />
            <span className="text-xs sm:text-sm font-medium">Prize Pool</span>
          </div>
          <span className="text-base sm:text-lg font-bold text-amber-500">
            {prizeConfig.prize_pool.toLocaleString()} sats
          </span>
        </div>

        {/* Prize distribution */}
        <div className="flex flex-wrap gap-1.5">
          {prizeConfig.prizes.slice(0, 5).map((prize) => (
            <Badge key={prize.rank} variant="secondary" className="text-[10px] sm:text-xs gap-1 px-2">
              #{prize.rank}: {prize.percentage}%
            </Badge>
          ))}
          {prizeConfig.prizes.length > 5 && (
            <Badge variant="secondary" className="text-[10px] sm:text-xs">
              +{prizeConfig.prizes.length - 5} more
            </Badge>
          )}
        </div>

        {/* Leaderboard */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
              Leaderboard
            </span>
            <span className="text-[10px] sm:text-xs text-muted-foreground">Top 10</span>
          </div>

          <div className="space-y-1.5 max-h-[260px] sm:max-h-[280px] overflow-y-auto pr-1 scrollbar-hide">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 sm:h-11" />
              ))
            ) : leaderboard.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 sm:py-8">
                <div className="p-3 rounded-full bg-muted/50 mb-3">
                  <Target className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground/40" />
                </div>
                <p className="text-xs sm:text-sm font-medium mb-1">No participants yet</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Be the first to compete!</p>
              </div>
            ) : (
              leaderboard.map((entry, index) => (
                <div
                  key={entry.user_id}
                  className={cn(
                    "flex items-center gap-2 p-2 sm:p-2.5 rounded-lg transition-colors",
                    entry.is_current_user
                      ? "bg-primary/10 border border-primary/30"
                      : index < 3 
                        ? "bg-gradient-to-r from-amber-500/5 to-transparent hover:from-amber-500/10"
                        : "hover:bg-muted/50"
                  )}
                >
                  {getRankBadge(entry.rank)}
                  <Avatar className="h-6 w-6 sm:h-7 sm:w-7">
                    <AvatarImage src={entry.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px] sm:text-xs">
                      {entry.username?.slice(0, 2).toUpperCase() || "??"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-xs sm:text-sm truncate",
                      entry.is_current_user && "font-semibold"
                    )}>
                      {entry.username || "Anonymous"}
                      {entry.is_current_user && (
                        <span className="text-[10px] text-primary ml-1">(You)</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs sm:text-sm font-semibold">
                      {entry.score.toLocaleString()}
                      <span className="text-[10px] sm:text-xs text-muted-foreground ml-1">{getScoreLabel()}</span>
                    </p>
                    {getPrizeAmount(entry.rank) && (
                      <p className="text-[10px] sm:text-xs text-amber-500 font-medium">
                        +{getPrizeAmount(entry.rank)?.toLocaleString()} sats
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* User position if not in top 10 */}
          {userPosition && !leaderboard.some((e) => e.is_current_user) && (
            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center gap-2 p-2 sm:p-2.5 rounded-lg bg-primary/10 border border-primary/30">
                {getRankBadge(userPosition.rank)}
                <Avatar className="h-6 w-6 sm:h-7 sm:w-7">
                  <AvatarFallback className="text-[10px] bg-primary/20">
                    <Star className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold">Your Position</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs sm:text-sm font-semibold">
                    {userPosition.score.toLocaleString()}
                    <span className="text-[10px] sm:text-xs text-muted-foreground ml-1">{getScoreLabel()}</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function TournamentStats({ period }: { period: TournamentPeriod }) {
  const totalPrize = useMemo(() => 
    Object.values(PRIZE_CONFIGS[period]).reduce((sum, cfg) => sum + cfg.prize_pool, 0),
    [period]
  )

  const totalWinners = useMemo(() =>
    Object.values(PRIZE_CONFIGS[period]).reduce((sum, cfg) => sum + cfg.prizes.length, 0),
    [period]
  )

  const stats = [
    {
      label: "Tournament Types",
      value: "3",
      icon: Target,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Total Prize Pool",
      value: `${totalPrize.toLocaleString()} sats`,
      icon: Coins,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Duration",
      value: period === "daily" ? "24 Hours" : period === "weekly" ? "7 Days" : "30 Days",
      icon: Clock,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      label: "Winners",
      value: totalWinners.toString(),
      icon: Trophy,
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/10",
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-border/50 hover:shadow-md transition-all duration-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className={cn("p-2 sm:p-2.5 rounded-xl shrink-0", stat.bgColor)}>
                <stat.icon className={cn("h-4 w-4 sm:h-5 sm:w-5", stat.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stat.label}</p>
                <p className="text-sm sm:text-lg font-bold truncate">{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function HowItWorks() {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm sm:text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          How Tournaments Work
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="font-medium text-xs sm:text-sm">Faucet Champion</span>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
              Claim the manual faucet as many times as possible. Each successful claim counts toward your score.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="font-medium text-xs sm:text-sm">Offerwall Master</span>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
              Complete offers and surveys. Your total earnings from all offerwalls determine your ranking.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="font-medium text-xs sm:text-sm">Top Earner</span>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
              Earn from any source - faucets, offerwalls, games, referrals. Total earnings count!
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border/50">
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Note:</span> Prizes are distributed automatically at midnight UTC. 
            Your activity is tracked in real-time. No registration required - just earn and compete!
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function TournamentsContent({ userId }: TournamentsContentProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<TournamentPeriod>("daily")

  return (
    <div className="space-y-5 sm:space-y-6 w-full">
      {/* Period tabs */}
      <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as TournamentPeriod)} className="w-full">
        <TabsList className="grid w-full sm:w-auto sm:inline-grid grid-cols-3 h-10 sm:h-11">
          {PERIODS.map((p) => (
            <TabsTrigger key={p.period} value={p.period} className="gap-1.5 text-xs sm:text-sm">
              <p.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{p.name}</span>
              <span className="sm:hidden">{p.shortName}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {PERIODS.map((p) => (
          <TabsContent key={p.period} value={p.period} className="space-y-5 sm:space-y-6 mt-5 sm:mt-6">
            {/* Stats for this period */}
            <TournamentStats period={p.period} />

            {/* Info banner */}
            <Card className="border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/20 shrink-0">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium text-xs sm:text-sm">
                      {p.name} tournaments reset at midnight UTC
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      {p.period === "daily"
                        ? "Compete every day for fresh prizes. Your activity is tracked automatically!"
                        : p.period === "weekly"
                          ? "Weekly tournaments run Monday to Sunday. Bigger prizes await!"
                          : "Monthly tournaments offer the biggest prize pools. Go for the grand prizes!"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tournament cards grid */}
            <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {TOURNAMENT_TYPES.map((t) => (
                <TournamentCard
                  key={`${p.period}-${t.type}`}
                  type={t.type}
                  period={p.period}
                  userId={userId}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* How it works */}
      <HowItWorks />
    </div>
  )
}

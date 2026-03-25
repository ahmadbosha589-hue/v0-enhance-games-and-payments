"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Crown, Trophy, Users, Clock, Coins, Zap, Target,
  TrendingUp, Medal, Calendar, Gift, Droplets, ShoppingBag,
  ChevronRight, Star, Sparkles,
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

interface TournamentData {
  type: TournamentType
  period: TournamentPeriod
  name: string
  description: string
  prize_pool: number
  prizes: { rank: number; percentage: number }[]
  leaderboard: LeaderboardEntry[]
  userPosition: { user_id: string; score: number; rank: number } | null
  timeRemaining: string
  endsAt: Date
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const TOURNAMENT_TYPES: { type: TournamentType; name: string; icon: typeof Droplets; color: string; bgColor: string }[] = [
  { type: "faucet_claims", name: "Faucet Champion", icon: Droplets, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  { type: "offerwall_earnings", name: "Offerwall Master", icon: ShoppingBag, color: "text-purple-500", bgColor: "bg-purple-500/10" },
  { type: "highest_earners", name: "Top Earner", icon: TrendingUp, color: "text-green-500", bgColor: "bg-green-500/10" },
]

const PERIODS: { period: TournamentPeriod; name: string; shortName: string }[] = [
  { period: "daily", name: "Daily", shortName: "24h" },
  { period: "weekly", name: "Weekly", shortName: "7d" },
  { period: "monthly", name: "Monthly", shortName: "30d" },
]

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

function getTimeRemaining(endDate: Date): string {
  const now = new Date()
  const diff = endDate.getTime() - now.getTime()

  if (diff <= 0) return "Ended"

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) return `${days}d ${hours}h remaining`
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
}

const PRIZE_CONFIGS: Record<TournamentPeriod, Record<TournamentType, { prize_pool: number; prizes: { rank: number; percentage: number }[] }>> = {
  daily: {
    faucet_claims: { prize_pool: 5000, prizes: [{ rank: 1, percentage: 50 }, { rank: 2, percentage: 30 }, { rank: 3, percentage: 20 }] },
    offerwall_earnings: { prize_pool: 10000, prizes: [{ rank: 1, percentage: 50 }, { rank: 2, percentage: 30 }, { rank: 3, percentage: 20 }] },
    highest_earners: { prize_pool: 15000, prizes: [{ rank: 1, percentage: 50 }, { rank: 2, percentage: 30 }, { rank: 3, percentage: 20 }] },
  },
  weekly: {
    faucet_claims: { prize_pool: 25000, prizes: [{ rank: 1, percentage: 40 }, { rank: 2, percentage: 25 }, { rank: 3, percentage: 15 }, { rank: 4, percentage: 10 }, { rank: 5, percentage: 10 }] },
    offerwall_earnings: { prize_pool: 50000, prizes: [{ rank: 1, percentage: 40 }, { rank: 2, percentage: 25 }, { rank: 3, percentage: 15 }, { rank: 4, percentage: 10 }, { rank: 5, percentage: 10 }] },
    highest_earners: { prize_pool: 75000, prizes: [{ rank: 1, percentage: 40 }, { rank: 2, percentage: 25 }, { rank: 3, percentage: 15 }, { rank: 4, percentage: 10 }, { rank: 5, percentage: 10 }] },
  },
  monthly: {
    faucet_claims: { prize_pool: 100000, prizes: [{ rank: 1, percentage: 35 }, { rank: 2, percentage: 20 }, { rank: 3, percentage: 15 }, { rank: 4, percentage: 10 }, { rank: 5, percentage: 8 }, { rank: 6, percentage: 5 }, { rank: 7, percentage: 4 }, { rank: 8, percentage: 3 }] },
    offerwall_earnings: { prize_pool: 200000, prizes: [{ rank: 1, percentage: 35 }, { rank: 2, percentage: 20 }, { rank: 3, percentage: 15 }, { rank: 4, percentage: 10 }, { rank: 5, percentage: 8 }, { rank: 6, percentage: 5 }, { rank: 7, percentage: 4 }, { rank: 8, percentage: 3 }] },
    highest_earners: { prize_pool: 300000, prizes: [{ rank: 1, percentage: 35 }, { rank: 2, percentage: 20 }, { rank: 3, percentage: 15 }, { rank: 4, percentage: 10 }, { rank: 5, percentage: 8 }, { rank: 6, percentage: 5 }, { rank: 7, percentage: 4 }, { rank: 8, percentage: 3 }] },
  },
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
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining(end))

  const { data, isLoading } = useSWR(
    `/api/tournaments/leaderboard?type=${type}&period=${period}&limit=10`,
    fetcher,
    { refreshInterval: 30000 }
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(getTimeRemaining(end))
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
    if (rank === 1) return <Crown className="h-4 w-4 text-yellow-500" />
    if (rank === 2) return <Medal className="h-4 w-4 text-gray-400" />
    if (rank === 3) return <Medal className="h-4 w-4 text-amber-600" />
    return <span className="text-xs text-muted-foreground font-medium">#{rank}</span>
  }

  const getPrizeAmount = (rank: number) => {
    const prize = prizeConfig.prizes.find((p) => p.rank === rank)
    if (!prize) return null
    return Math.floor(prizeConfig.prize_pool * prize.percentage / 100)
  }

  return (
    <Card className={cn(
      "border-2 transition-all duration-300 hover:shadow-lg overflow-hidden",
      "border-border/50 hover:border-primary/30"
    )}>
      {/* Header gradient */}
      <div className={cn("h-1.5 w-full bg-gradient-to-r",
        type === "faucet_claims" ? "from-blue-500 to-cyan-400" :
          type === "offerwall_earnings" ? "from-purple-500 to-pink-400" :
            "from-green-500 to-emerald-400"
      )} />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl", typeConfig.bgColor)}>
              <typeConfig.icon className={cn("h-5 w-5", typeConfig.color)} />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg leading-tight">
                {period === "daily" ? "Daily" : period === "weekly" ? "Weekly" : "Monthly"} {typeConfig.name}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {type === "faucet_claims" ? "Most manual faucet claims" :
                  type === "offerwall_earnings" ? "Highest offerwall earnings" :
                    "Highest total earnings"}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs gap-1">
            <Clock className="h-3 w-3" />
            {timeRemaining.split(" ")[0]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Prize pool */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-yellow-500/10 to-amber-500/5 border border-yellow-500/20">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium">Prize Pool</span>
          </div>
          <span className="text-lg font-bold text-yellow-500">
            {prizeConfig.prize_pool.toLocaleString()} sats
          </span>
        </div>

        {/* Prize distribution */}
        <div className="flex flex-wrap gap-1.5">
          {prizeConfig.prizes.slice(0, 5).map((prize) => (
            <Badge key={prize.rank} variant="secondary" className="text-xs gap-1">
              #{prize.rank}: {prize.percentage}%
            </Badge>
          ))}
          {prizeConfig.prizes.length > 5 && (
            <Badge variant="secondary" className="text-xs">
              +{prizeConfig.prizes.length - 5} more
            </Badge>
          )}
        </div>

        {/* Leaderboard */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-500" />
              Leaderboard
            </span>
            <span className="text-xs text-muted-foreground">Top 10</span>
          </div>

          <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))
            ) : leaderboard.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No participants yet</p>
                <p className="text-xs">Be the first to compete!</p>
              </div>
            ) : (
              leaderboard.map((entry, index) => (
                <div
                  key={entry.user_id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg transition-colors",
                    entry.is_current_user
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted/50",
                    index < 3 && "bg-gradient-to-r from-yellow-500/5 to-transparent"
                  )}
                >
                  <div className="w-6 flex justify-center">
                    {getRankBadge(entry.rank)}
                  </div>
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={entry.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {entry.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm truncate",
                      entry.is_current_user && "font-semibold"
                    )}>
                      {entry.username}
                      {entry.is_current_user && (
                        <span className="text-xs text-primary ml-1">(You)</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {entry.score.toLocaleString()} <span className="text-xs text-muted-foreground">{getScoreLabel()}</span>
                    </p>
                    {getPrizeAmount(entry.rank) && (
                      <p className="text-xs text-yellow-500">
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
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/30">
                <div className="w-6 flex justify-center">
                  <span className="text-xs text-muted-foreground font-medium">#{userPosition.rank}</span>
                </div>
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary/20">
                    <Star className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Your Position</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {userPosition.score.toLocaleString()} <span className="text-xs text-muted-foreground">{getScoreLabel()}</span>
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
  const totalPrize = Object.values(PRIZE_CONFIGS[period]).reduce((sum, cfg) => sum + cfg.prize_pool, 0)

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
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
    {
      label: "Competition",
      value: period === "daily" ? "24 Hours" : period === "weekly" ? "7 Days" : "30 Days",
      icon: Clock,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      label: "Winners",
      value: period === "daily" ? "9" : period === "weekly" ? "15" : "24",
      icon: Trophy,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
  ]

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border bg-gradient-to-br from-muted/30 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={cn("p-2 rounded-lg", stat.bgColor)}>
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

export function TournamentsContent({ userId }: TournamentsContentProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<TournamentPeriod>("daily")

  return (
    <div className="space-y-6 w-full">
      {/* Period tabs */}
      <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as TournamentPeriod)} className="w-full">
        <TabsList className="grid w-full sm:w-auto sm:inline-grid grid-cols-3">
          {PERIODS.map((p) => (
            <TabsTrigger key={p.period} value={p.period} className="gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {p.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {PERIODS.map((p) => (
          <TabsContent key={p.period} value={p.period} className="space-y-6 mt-6">
            {/* Stats for this period */}
            <TournamentStats period={p.period} />

            {/* Info banner */}
            <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-primary/10 shrink-0">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {p.name} tournaments reset at midnight UTC
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
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
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
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

      {/* Rules section */}
      <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            How Tournaments Work
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Droplets className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-sm">Faucet Champion</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Claim the manual faucet as many times as possible. Each successful claim counts toward your score.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-purple-500" />
                <span className="font-medium text-sm">Offerwall Master</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Complete offers and surveys. Your total earnings from all offerwalls determine your ranking.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="font-medium text-sm">Top Earner</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Earn from any source - faucets, offerwalls, games, referrals. Total earnings count!
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t">
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">*</span>
                Prizes are distributed automatically when the tournament ends
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">*</span>
                Leaderboards update every 30 seconds
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">*</span>
                Cheating or abuse will result in disqualification
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

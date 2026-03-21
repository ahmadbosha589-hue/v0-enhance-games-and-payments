import { Suspense } from "react"
import { getUser, createAdminClient, safeQuery } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Crown, Trophy, Users, Calendar, Sparkles, ChevronRight,
  Clock, Coins, AlertCircle, Gamepad2, Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Tournaments | CryptoFaucet",
  description: "Compete in tournaments and win prize pools",
}

interface TournamentInfo {
  id: string
  name: string
  game_type: string
  start_time: string
  end_time: string
  prize_pool: number
  entry_fee: number
  participants: number
  max_participants: number
  status: "active" | "upcoming" | "ended"
}

// ─── data fetcher ─────────────────────────────────────────────────────────────

async function fetchTournaments(): Promise<TournamentInfo[]> {
  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) return []

    const result = await safeQuery(
      () =>
        adminSupabase
          .from("game_tournaments")
          .select("*")
          .order("start_time", { ascending: true })
          .limit(20),
      [],
    )
    return (result || []) as TournamentInfo[]
  } catch {
    return []
  }
}

// ─── stats row ────────────────────────────────────────────────────────────────

async function TournamentStats() {
  const list = await fetchTournaments()

  const active = list.filter(t => t.status === "active").length
  const upcoming = list.filter(t => t.status === "upcoming").length
  const totalPrize = list
    .filter(t => t.status !== "ended")
    .reduce((s, t) => s + (t.prize_pool || 0), 0)
  const totalPlayers = list.reduce((s, t) => s + (t.participants || 0), 0)

  const stats = [
    {
      label: "Active Now",
      value: active.toString(),
      icon: Zap,
      color: "text-green-500",
      border: "border-green-500/20",
      bg: "from-green-500/5",
      iconBg: "bg-green-500/10",
    },
    {
      label: "Upcoming",
      value: upcoming.toString(),
      icon: Clock,
      color: "text-blue-500",
      border: "border-blue-500/20",
      bg: "from-blue-500/5",
      iconBg: "bg-blue-500/10",
    },
    {
      label: "Total Prize Pool",
      value: totalPrize > 0 ? `${totalPrize.toLocaleString()} sats` : "—",
      icon: Coins,
      color: "text-yellow-500",
      border: "border-yellow-500/20",
      bg: "from-yellow-500/5",
      iconBg: "bg-yellow-500/10",
    },
    {
      label: "Players Competing",
      value: totalPlayers > 0 ? totalPlayers.toLocaleString() : "—",
      icon: Users,
      color: "text-purple-500",
      border: "border-purple-500/20",
      bg: "from-purple-500/5",
      iconBg: "bg-purple-500/10",
    },
  ]

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map(stat => (
        <Card
          key={stat.label}
          className={cn("border bg-gradient-to-br to-transparent", stat.border, stat.bg)}
        >
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={cn("p-2 rounded-lg", stat.iconBg)}>
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

// ─── tournament list ──────────────────────────────────────────────────────────

async function TournamentList() {
  const list = await fetchTournaments()

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="relative mb-6">
          <Crown className="h-20 w-20 text-muted-foreground/15" />
          <div className="absolute -bottom-1 -right-1 bg-amber-500/20 rounded-full p-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
          </div>
        </div>
        <h3 className="text-xl font-semibold mb-2">No Tournaments Yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Real prize-pool tournaments with leaderboard tracking are on the way.
          Stay tuned for announcements!
        </p>
      </div>
    )
  }

  const grouped = {
    active: list.filter(t => t.status === "active"),
    upcoming: list.filter(t => t.status === "upcoming"),
    ended: list.filter(t => t.status === "ended"),
  }

  const renderCard = (tournament: TournamentInfo) => {
    const isActive = tournament.status === "active"
    const isUpcoming = tournament.status === "upcoming"
    const fillPct =
      tournament.max_participants > 0
        ? (tournament.participants / tournament.max_participants) * 100
        : 0

    return (
      <Card
        key={tournament.id}
        className={cn(
          "border-2 transition-all duration-300 hover:shadow-lg overflow-hidden",
          isActive
            ? "border-green-500/40 bg-gradient-to-br from-green-500/5 to-transparent"
            : isUpcoming
              ? "border-blue-500/40 bg-gradient-to-br from-blue-500/5 to-transparent"
              : "border-muted/30 bg-muted/5 opacity-70",
        )}
      >
        {/* Color strip */}
        <div
          className={cn(
            "h-1 w-full",
            isActive
              ? "bg-gradient-to-r from-green-500 to-emerald-400"
              : isUpcoming
                ? "bg-gradient-to-r from-blue-500 to-cyan-400"
                : "bg-muted",
          )}
        />

        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "p-2 rounded-lg",
                  isActive ? "bg-green-500/15" : isUpcoming ? "bg-blue-500/15" : "bg-muted",
                )}
              >
                <Crown
                  className={cn(
                    "h-5 w-5",
                    isActive
                      ? "text-green-500"
                      : isUpcoming
                        ? "text-blue-500"
                        : "text-muted-foreground",
                  )}
                />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg leading-tight">
                  {tournament.name}
                </CardTitle>
                <CardDescription className="text-xs capitalize">
                  {tournament.game_type?.replace(/_/g, " ") || "All Games"}
                </CardDescription>
              </div>
            </div>

            <Badge
              variant={isActive ? "default" : isUpcoming ? "secondary" : "outline"}
              className={cn(
                "shrink-0 text-xs",
                isActive ? "bg-green-500 text-white hover:bg-green-600" : "",
              )}
            >
              {isActive && <Sparkles className="h-3 w-3 mr-1" />}
              {tournament.status.charAt(0).toUpperCase() + tournament.status.slice(1)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Prize stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="space-y-0.5">
              <p className="text-[10px] sm:text-xs text-muted-foreground">Prize Pool</p>
              <p className="text-base sm:text-lg font-bold text-yellow-500">
                {tournament.prize_pool?.toLocaleString() ?? "—"} sats
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] sm:text-xs text-muted-foreground">Entry Fee</p>
              <p className="text-base sm:text-lg font-bold">
                {tournament.entry_fee === 0 ? "Free" : `${tournament.entry_fee} sats`}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] sm:text-xs text-muted-foreground">Players</p>
              <p className="text-base sm:text-lg font-bold">
                {tournament.participants}/{tournament.max_participants}
              </p>
            </div>
          </div>

          {/* Fill progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Spots filled</span>
              <span>{Math.round(fillPct)}%</span>
            </div>
            <Progress
              value={fillPct}
              className={cn("h-1.5", isActive ? "[&>div]:bg-green-500" : "")}
            />
          </div>

          {/* Footer row */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {tournament.status === "ended"
                  ? "Ended"
                  : tournament.status === "active"
                    ? "Ends soon"
                    : "Starting soon"}
              </span>
            </div>
            <Button size="sm" variant="outline" disabled className="opacity-60 text-xs h-8">
              Coming Soon
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {grouped.active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-green-500" />
            Active Tournaments
            <Badge variant="secondary" className="text-xs">
              {grouped.active.length}
            </Badge>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {grouped.active.map(renderCard)}
          </div>
        </div>
      )}

      {grouped.upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            Upcoming Tournaments
            <Badge variant="secondary" className="text-xs">
              {grouped.upcoming.length}
            </Badge>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {grouped.upcoming.map(renderCard)}
          </div>
        </div>
      )}

      {grouped.ended.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-muted-foreground flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Past Tournaments
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {grouped.ended.map(renderCard)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function TournamentsPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login?redirect=/dashboard/tournaments")

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Crown className="h-6 w-6 sm:h-7 sm:w-7 text-yellow-500" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tournaments</h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            Compete for prize pools, claim glory, and top the leaderboard
          </p>
        </div>
        <Badge variant="outline" className="self-start flex items-center gap-1.5 py-1.5 px-3">
          <Gamepad2 className="h-3.5 w-3.5" />
          Games-based competition
        </Badge>
      </div>

      {/* Coming Soon Banner */}
      <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-yellow-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-500/20 animate-pulse shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                Tournaments are coming soon
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Real prize-pool tournaments with live leaderboards are in development.
                Follow announcements for launch details.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <Suspense
        fallback={
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        }
      >
        <TournamentStats />
      </Suspense>

      {/* List */}
      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        }
      >
        <TournamentList />
      </Suspense>

      {/* Rules */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-primary" />
            Tournament Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            {[
              "Entry fee is deducted from your balance when you register",
              "Your best score during the tournament period counts toward the leaderboard",
              "Top 10 players split the prize pool — 50%, 25%, 10%, 5%, then equal shares",
              "Cheating or score manipulation results in immediate disqualification and account ban",
            ].map(rule => (
              <li key={rule} className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                {rule}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

    </div>
  )
}

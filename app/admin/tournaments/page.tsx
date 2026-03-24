import { createAdminClient, safeQuery } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Crown,
  Trophy,
  Users,
  Calendar,
  Coins,
  Plus,
  AlertCircle,
  Zap,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Tournament Management | Admin",
  description: "Manage game tournaments",
}

interface Tournament {
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
  created_at: string
}

async function fetchTournaments(): Promise<Tournament[]> {
  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) return []

    const result = await safeQuery(
      () =>
        adminSupabase
          .from("game_tournaments")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      [],
    )
    return (result || []) as Tournament[]
  } catch {
    return []
  }
}

async function fetchStats() {
  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) return { total: 0, active: 0, upcoming: 0, totalPrize: 0, totalPlayers: 0 }

    const list = await safeQuery(
      () => adminSupabase.from("game_tournaments").select("*"),
      [],
    ) as Tournament[]

    return {
      total: list.length,
      active: list.filter(t => t.status === "active").length,
      upcoming: list.filter(t => t.status === "upcoming").length,
      totalPrize: list.reduce((s, t) => s + (t.prize_pool || 0), 0),
      totalPlayers: list.reduce((s, t) => s + (t.participants || 0), 0),
    }
  } catch {
    return { total: 0, active: 0, upcoming: 0, totalPrize: 0, totalPlayers: 0 }
  }
}

export default async function AdminTournamentsPage() {
  const [tournaments, stats] = await Promise.all([
    fetchTournaments(),
    fetchStats(),
  ])

  const statCards = [
    {
      label: "Total Tournaments",
      value: stats.total.toString(),
      icon: Trophy,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Active Now",
      value: stats.active.toString(),
      icon: Zap,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Upcoming",
      value: stats.upcoming.toString(),
      icon: Clock,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Total Prize Pool",
      value: `${stats.totalPrize.toLocaleString()} sats`,
      icon: Coins,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
    {
      label: "Total Players",
      value: stats.totalPlayers.toString(),
      icon: Users,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Crown className="h-6 w-6 text-yellow-500" />
            Tournament Management
          </h1>
          <p className="text-muted-foreground">Create and manage game tournaments</p>
        </div>
        <Button disabled className="gap-2">
          <Plus className="h-4 w-4" />
          Create Tournament
        </Button>
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
                Tournament System Coming Soon
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                The full tournament management system with prize pools, leaderboards, and automated payouts is in development.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {statCards.map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", stat.bgColor)}>
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tournaments Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Tournaments</CardTitle>
          <CardDescription>
            {tournaments.length} tournaments found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tournaments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="relative mb-6">
                <Crown className="h-16 w-16 text-muted-foreground/20" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Tournaments Yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Create your first tournament to start engaging users with competitive play.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tournament</TableHead>
                    <TableHead>Game</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Prize Pool</TableHead>
                    <TableHead className="text-right">Entry Fee</TableHead>
                    <TableHead className="text-right">Players</TableHead>
                    <TableHead>Schedule</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tournaments.map(tournament => (
                    <TableRow key={tournament.id}>
                      <TableCell className="font-medium">{tournament.name}</TableCell>
                      <TableCell className="capitalize">
                        {tournament.game_type?.replace(/_/g, " ") || "All"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            tournament.status === "active"
                              ? "default"
                              : tournament.status === "upcoming"
                                ? "secondary"
                                : "outline"
                          }
                          className={cn(
                            tournament.status === "active" && "bg-green-500 hover:bg-green-600"
                          )}
                        >
                          {tournament.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {tournament.prize_pool?.toLocaleString() || 0} sats
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {tournament.entry_fee === 0 ? "Free" : `${tournament.entry_fee} sats`}
                      </TableCell>
                      <TableCell className="text-right">
                        {tournament.participants}/{tournament.max_participants}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {tournament.start_time
                            ? formatDistanceToNow(new Date(tournament.start_time), { addSuffix: true })
                            : "—"}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

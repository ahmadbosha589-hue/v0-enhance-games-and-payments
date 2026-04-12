import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
  Zap,
  Clock,
  Droplets,
  ShoppingBag,
  TrendingUp,
  Target,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { AdminTournamentsActions } from "@/components/admin/tournaments-actions"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Tournament Management | Admin",
  description: "Manage platform tournaments",
}

interface Tournament {
  id: string
  type: string
  period: string
  name: string
  description: string
  prize_pool: number
  prizes: { rank: number; percentage: number }[]
  starts_at: string
  ends_at: string
  status: "active" | "completed" | "cancelled"
  created_at: string
}

interface TournamentParticipant {
  tournament_id: string
  user_id: string
  score: number
  rank: number | null
  prize_amount: number | null
}

async function fetchTournaments(): Promise<Tournament[]> {
  const adminSupabase = createAdminClient()
  if (!adminSupabase) {
    console.warn("[Admin Tournaments] Database not configured")
    return []
  }

  try {
    const { data, error } = await adminSupabase
      .from("tournaments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("[Admin Tournaments] Error fetching:", error)
      return []
    }
    return (data || []) as Tournament[]
  } catch (err) {
    console.error("[Admin Tournaments] Exception:", err)
    return []
  }
}

async function fetchParticipantCounts(): Promise<Record<string, number>> {
  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) return {}

    const { data, error } = await adminSupabase
      .from("tournament_participants")
      .select("tournament_id")

    if (error) {
      console.error("[Admin Tournaments] Error fetching participants:", error)
      return {}
    }

    const counts: Record<string, number> = {}
      ; (data || []).forEach((p: { tournament_id: string }) => {
        counts[p.tournament_id] = (counts[p.tournament_id] || 0) + 1
      })
    return counts
  } catch (err) {
    console.error("[Admin Tournaments] Participants exception:", err)
    return {}
  }
}

async function fetchStats(tournaments: Tournament[], participantCounts: Record<string, number>) {
  const active = tournaments.filter(t => t.status === "active").length
  const completed = tournaments.filter(t => t.status === "completed").length
  const totalPrize = tournaments.reduce((s, t) => s + (t.prize_pool || 0), 0)
  const totalPlayers = Object.values(participantCounts).reduce((s, c) => s + c, 0)

  return {
    total: tournaments.length,
    active,
    completed,
    totalPrize,
    totalPlayers,
  }
}

const typeIcons: Record<string, typeof Droplets> = {
  faucet_claims: Droplets,
  offerwall_earnings: ShoppingBag,
  highest_earners: TrendingUp,
}

const typeColors: Record<string, string> = {
  faucet_claims: "text-blue-500",
  offerwall_earnings: "text-purple-500",
  highest_earners: "text-green-500",
}

const periodLabels: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
}

export default async function AdminTournamentsPage() {
  const [tournaments, participantCounts] = await Promise.all([
    fetchTournaments(),
    fetchParticipantCounts(),
  ])

  const stats = await fetchStats(tournaments, participantCounts)

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
      label: "Completed",
      value: stats.completed.toString(),
      icon: Target,
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
      label: "Total Participants",
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
          <p className="text-muted-foreground">Create and manage platform tournaments</p>
        </div>
        <AdminTournamentsActions />
      </div>

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

      {/* Tournament Types Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-blue-500/10">
                <Droplets className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="font-semibold">Faucet Champion</p>
                <p className="text-xs text-muted-foreground">Most manual faucet claims</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-purple-500/10">
                <ShoppingBag className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="font-semibold">Offerwall Master</p>
                <p className="text-xs text-muted-foreground">Highest offerwall earnings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-green-500/10">
                <TrendingUp className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="font-semibold">Top Earner</p>
                <p className="text-xs text-muted-foreground">Highest total earnings</p>
              </div>
            </div>
          </CardContent>
        </Card>
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
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Click "Create All Tournaments" to automatically create daily, weekly, and monthly tournaments for all types.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tournament</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Prize Pool</TableHead>
                    <TableHead className="text-right">Participants</TableHead>
                    <TableHead>Schedule</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tournaments.map(tournament => {
                    const TypeIcon = typeIcons[tournament.type] || Trophy
                    const typeColor = typeColors[tournament.type] || "text-amber-500"

                    return (
                      <TableRow key={tournament.id}>
                        <TableCell className="font-medium">{tournament.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TypeIcon className={cn("h-4 w-4", typeColor)} />
                            <span className="text-sm capitalize">
                              {tournament.type.replace(/_/g, " ")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {periodLabels[tournament.period] || tournament.period}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              tournament.status === "active"
                                ? "default"
                                : tournament.status === "completed"
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
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            {participantCounts[tournament.id] || 0}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {tournament.ends_at
                              ? `Ends ${formatDistanceToNow(new Date(tournament.ends_at), { addSuffix: true })}`
                              : "—"}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prize Distribution Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="h-4 w-4 text-yellow-500" />
            Prize Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Daily (Top 3)
              </h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>1st Place: 50%</p>
                <p>2nd Place: 30%</p>
                <p>3rd Place: 20%</p>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Weekly (Top 5)
              </h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>1st: 40% | 2nd: 25% | 3rd: 15%</p>
                <p>4th: 10% | 5th: 10%</p>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5" />
                Monthly (Top 8)
              </h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>1st: 35% | 2nd: 20% | 3rd: 15%</p>
                <p>4th: 10% | 5th-8th: 8%, 5%, 4%, 3%</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

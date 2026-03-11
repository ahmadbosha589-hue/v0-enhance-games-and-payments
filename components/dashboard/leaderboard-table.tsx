import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { formatSatoshisDisplay, formatNumber } from "@/lib/utils/format"
import { cn } from "@/lib/utils"

interface LeaderboardEntry {
  id: string
  display_name: string | null
  total_earned_satoshis: number
  total_claims: number
  max_claim_streak: number
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  currentUserId: string
}

export function LeaderboardTable({ entries, currentUserId }: LeaderboardTableProps) {
  if (!entries || entries.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No leaderboard data available.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Rank</TableHead>
          <TableHead>User</TableHead>
          <TableHead className="text-right">Claims</TableHead>
          <TableHead className="text-right">Best Streak</TableHead>
          <TableHead className="text-right">Total Earned</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, index) => {
          const isCurrentUser = entry.id === currentUserId
          const initials = entry.display_name?.slice(0, 2).toUpperCase() || "U"

          return (
            <TableRow key={entry.id} className={cn(isCurrentUser && "bg-primary/5")}>
              <TableCell className="font-medium">#{index + 1}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-xs text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <span className={cn("font-medium", isCurrentUser && "text-primary")}>
                    {entry.display_name || "Anonymous"}
                    {isCurrentUser && " (You)"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right text-muted-foreground">{formatNumber(entry.total_claims)}</TableCell>
              <TableCell className="text-right text-muted-foreground">{entry.max_claim_streak} days</TableCell>
              <TableCell className="text-right font-medium">
                {formatSatoshisDisplay(entry.total_earned_satoshis)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

import { formatSatoshisDisplay, formatRelativeTime } from "@/lib/utils/format"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Users, TrendingUp } from "lucide-react"

interface Referral {
  id: string
  display_name: string | null
  created_at: string
  total_earned_satoshis: number
  last_claim_at?: string | null
  status?: string
}

interface ReferralStatsProps {
  referrals: Referral[]
}

export function ReferralStats({ referrals }: ReferralStatsProps) {
  if (!referrals || referrals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
          <Users className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold mb-1">No referrals yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Share your referral link with friends and start earning commission on their claims!
        </p>
      </div>
    )
  }

  // Check if referral is active (claimed in last 7 days)
  const isActive = (lastClaimAt: string | null | undefined) => {
    if (!lastClaimAt) return false
    const lastClaim = new Date(lastClaimAt)
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    return lastClaim > weekAgo
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-green-500" />
          <span className="text-sm">
            Total earned by referrals:{" "}
            <strong>
              {formatSatoshisDisplay(referrals.reduce((sum, r) => sum + (r.total_earned_satoshis || 0), 0))}
            </strong>
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="hidden sm:table-cell">Joined</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="text-right">Their Earnings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {referrals.map((referral) => {
              const initials = referral.display_name?.slice(0, 2).toUpperCase() || "U"
              const active = isActive(referral.last_claim_at)

              return (
                <TableRow key={referral.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-xs text-primary">{initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <span className="font-medium">{referral.display_name || "Anonymous"}</span>
                        <span className="block text-xs text-muted-foreground sm:hidden">
                          {formatRelativeTime(referral.created_at)}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {formatRelativeTime(referral.created_at)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {referral.status === "banned" ? (
                      <Badge variant="destructive">Banned</Badge>
                    ) : active ? (
                      <Badge variant="default" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatSatoshisDisplay(referral.total_earned_satoshis)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

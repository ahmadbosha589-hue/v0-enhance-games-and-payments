import type { Transaction } from "@/lib/types/database"
import { formatSatoshisDisplay, formatDateTime } from "@/lib/utils/format"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Coins, Wallet, Users, Gift, Settings2, Flame, Award, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"

interface TransactionHistoryProps {
  transactions: Transaction[]
}

const typeConfig: Record<string, { icon: any; label: string; color: string }> = {
  claim: { icon: Coins, label: "Claim", color: "text-green-500" },
  withdrawal: { icon: Wallet, label: "Withdrawal", color: "text-blue-500" },
  referral_bonus: { icon: Users, label: "Referral Bonus", color: "text-purple-500" },
  bonus: { icon: Gift, label: "Bonus", color: "text-yellow-500" },
  daily_bonus: { icon: Gift, label: "Daily Bonus", color: "text-amber-500" },
  streak_bonus: { icon: Flame, label: "Streak Bonus", color: "text-orange-500" },
  signup_bonus: { icon: Award, label: "Signup Bonus", color: "text-cyan-500" },
  achievement: { icon: Trophy, label: "Achievement", color: "text-purple-500" },
  adjustment: { icon: Settings2, label: "Adjustment", color: "text-gray-500" },
}

const statusConfig = {
  pending: { label: "Pending", variant: "secondary" as const },
  completed: { label: "Completed", variant: "default" as const },
  failed: { label: "Failed", variant: "destructive" as const },
  cancelled: { label: "Cancelled", variant: "secondary" as const },
}

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        No transactions yet. Start claiming to see your history.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => {
          const type = typeConfig[tx.type] || typeConfig.adjustment
          const status = statusConfig[tx.status] || statusConfig.pending
          const TypeIcon = type.icon
          const isPositive = tx.amount_satoshis > 0

          return (
            <TableRow key={tx.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <TypeIcon className={cn("h-4 w-4", type.color)} />
                  <span>{type.label}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(tx.created_at)}</TableCell>
              <TableCell className="max-w-[200px] truncate text-muted-foreground">{tx.description || "-"}</TableCell>
              <TableCell>
                <Badge variant={status.variant}>{status.label}</Badge>
              </TableCell>
              <TableCell className={cn("text-right font-medium", isPositive ? "text-green-500" : "text-red-500")}>
                {isPositive ? "+" : ""}
                {formatSatoshisDisplay(tx.amount_satoshis)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

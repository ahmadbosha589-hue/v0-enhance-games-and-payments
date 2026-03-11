"use client"

import type { Withdrawal } from "@/lib/types/database"
import { formatSatoshisDisplay, formatDateTime, formatRelativeTime } from "@/lib/utils/format"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock, XCircle, AlertTriangle, Wallet, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface WithdrawalHistoryProps {
  withdrawals: Withdrawal[]
}

const statusConfig = {
  pending: { icon: Clock, label: "Pending", color: "text-amber-500", bg: "bg-amber-500/10" },
  processing: { icon: Clock, label: "Processing", color: "text-blue-500", bg: "bg-blue-500/10" },
  completed: { icon: CheckCircle, label: "Completed", color: "text-green-500", bg: "bg-green-500/10" },
  failed: { icon: XCircle, label: "Failed", color: "text-red-500", bg: "bg-red-500/10" },
  cancelled: { icon: XCircle, label: "Cancelled", color: "text-muted-foreground", bg: "bg-muted" },
  flagged: { icon: AlertTriangle, label: "Under Review", color: "text-orange-500", bg: "bg-orange-500/10" },
}

export function WithdrawalHistory({ withdrawals }: WithdrawalHistoryProps) {
  if (!withdrawals || withdrawals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
        <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-muted mb-3 sm:mb-4">
          <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground/50" />
        </div>
        <p className="text-sm sm:text-base font-medium text-muted-foreground">No withdrawal history</p>
        <p className="text-xs sm:text-sm text-muted-foreground/70 mt-1">Your withdrawal requests will appear here</p>
      </div>
    )
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <th className="pb-3 pr-4">Date</th>
              <th className="pb-3 pr-4">Amount</th>
              <th className="pb-3 pr-4">Fee</th>
              <th className="pb-3 pr-4">You Receive</th>
              <th className="pb-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {withdrawals.map((withdrawal) => {
              const status = statusConfig[withdrawal.status] || statusConfig.pending
              const StatusIcon = status.icon

              return (
                <tr key={withdrawal.id} className="group hover:bg-muted/50 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="text-sm">{formatDateTime(withdrawal.created_at)}</div>
                    <div className="text-xs text-muted-foreground">{formatRelativeTime(withdrawal.created_at)}</div>
                  </td>
                  <td className="py-3 pr-4 font-medium tabular-nums">
                    {formatSatoshisDisplay(withdrawal.amount_satoshis)}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground tabular-nums">
                    -{formatSatoshisDisplay(withdrawal.fee_satoshis)}
                  </td>
                  <td className="py-3 pr-4 font-semibold text-primary tabular-nums">
                    {formatSatoshisDisplay(withdrawal.net_amount_satoshis)}
                  </td>
                  <td className="py-3">
                    <Badge variant="secondary" className={cn("gap-1.5", status.bg, status.color)}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {withdrawals.map((withdrawal) => {
          const status = statusConfig[withdrawal.status] || statusConfig.pending
          const StatusIcon = status.icon

          return (
            <div
              key={withdrawal.id}
              className="rounded-lg border p-3 sm:p-4 space-y-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", status.bg)}>
                    <StatusIcon className={cn("h-4 w-4", status.color)} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(withdrawal.created_at)}</p>
                    <p className={cn("text-xs font-medium", status.color)}>{status.label}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-primary tabular-nums">
                    {formatSatoshisDisplay(withdrawal.net_amount_satoshis)}
                  </p>
                  <p className="text-xs text-muted-foreground">received</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs border-t pt-2">
                <div className="flex gap-4">
                  <div>
                    <span className="text-muted-foreground">Amount: </span>
                    <span className="font-medium tabular-nums">
                      {formatSatoshisDisplay(withdrawal.amount_satoshis)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fee: </span>
                    <span className="tabular-nums">-{formatSatoshisDisplay(withdrawal.fee_satoshis)}</span>
                  </div>
                </div>
                {withdrawal.tx_hash && (
                  <a
                    href={`https://mempool.space/tx/${withdrawal.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <span>View</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

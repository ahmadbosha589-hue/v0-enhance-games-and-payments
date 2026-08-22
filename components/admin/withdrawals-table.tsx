"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatSatoshi, formatRelativeTime } from "@/lib/utils"
import { CheckCircle, XCircle, AlertTriangle, Loader2, Eye, Shield, Users, Copy } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import Link from "next/link"

interface Withdrawal {
  id: string
  user_id: string
  amount_satoshis: number
  fee_satoshis: number
  net_amount_satoshis: number
  payment_currency: string
  payment_address: string
  payment_method: string
  status: string
  created_at: string
  is_flagged: boolean
  fraud_score: number
  flag_reason?: string
  profiles?: {
    id?: string
    username?: string | null
    display_name?: string | null
    fraud_score?: number
    is_flagged?: boolean
    faucetpay_email?: string | null
    referral_code?: string | null
    referred_by?: string | null
    total_claims?: number
    balance_satoshis?: number
  }
}

interface WithdrawalsTableProps {
  withdrawals: Withdrawal[]
  showActions?: boolean
  showFraudDetails?: boolean
}

export function WithdrawalsTable({ withdrawals, showActions, showFraudDetails }: WithdrawalsTableProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [approveTarget, setApproveTarget] = useState<Withdrawal | null>(null)
  const router = useRouter()

  const handleAction = async (withdrawalId: string, action: "approve" | "reject", notes?: string) => {
    setLoading(withdrawalId)
    try {
      const res = await fetch("/api/admin/withdrawals/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawalId, action, notes }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || "Action failed")
      }

      toast.success(`Withdrawal ${action === "approve" ? "approved" : "rejected"} successfully`)
      setRejectDialogOpen(false)
      setRejectReason("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to process withdrawal")
    } finally {
      setLoading(null)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="text-[10px] sm:text-xs">
            Pending
          </Badge>
        )
      case "processing":
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] sm:text-xs">Processing</Badge>
        )
      case "completed":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] sm:text-xs">
            Completed
          </Badge>
        )
      case "failed":
        return (
          <Badge variant="destructive" className="text-[10px] sm:text-xs">
            Failed
          </Badge>
        )
      case "rejected":
        return (
          <Badge variant="destructive" className="text-[10px] sm:text-xs">
            Rejected
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="text-[10px] sm:text-xs">
            {status}
          </Badge>
        )
    }
  }

  const getFraudScoreColor = (score: number) => {
    if (score >= 70) return "text-red-500 font-bold"
    if (score >= 40) return "text-amber-500 font-semibold"
    return "text-emerald-500"
  }

  if (withdrawals.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12 text-muted-foreground">
        <Shield className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm sm:text-base">No withdrawals found matching your criteria</p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs sm:text-sm min-w-[150px]">User</TableHead>
              <TableHead className="text-xs sm:text-sm">Amount</TableHead>
              <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Currency</TableHead>
              <TableHead className="text-xs sm:text-sm">Status</TableHead>
              {showFraudDetails && <TableHead className="text-xs sm:text-sm">Fraud</TableHead>}
              <TableHead className="text-xs sm:text-sm hidden md:table-cell">FaucetPay</TableHead>
              <TableHead className="text-xs sm:text-sm hidden lg:table-cell">Referrer</TableHead>
              <TableHead className="text-xs sm:text-sm">Requested</TableHead>
              {showActions && <TableHead className="w-[100px] sm:w-[150px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {withdrawals.map((withdrawal) => {
              const displayName =
                withdrawal.profiles?.display_name ||
                withdrawal.profiles?.username ||
                `User ${withdrawal.user_id.slice(0, 8)}`
              const isFlagged = withdrawal.is_flagged || withdrawal.profiles?.is_flagged
              const fraudScore = withdrawal.fraud_score || withdrawal.profiles?.fraud_score || 0

              return (
                <TableRow key={withdrawal.id} className={isFlagged ? "bg-red-500/5" : ""}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-xs sm:text-sm truncate max-w-[100px] sm:max-w-[150px]">
                          {displayName}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 sm:h-6 sm:w-6"
                          onClick={() => copyToClipboard(withdrawal.user_id)}
                        >
                          <Copy className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        </Button>
                      </div>
                      {isFlagged && (
                        <div className="flex items-center gap-1 text-red-500">
                          <AlertTriangle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          <span className="text-[10px] sm:text-xs">Flagged</span>
                        </div>
                      )}
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        Claims: {withdrawal.profiles?.total_claims || 0}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="font-medium text-xs sm:text-sm">{formatSatoshi(withdrawal.amount_satoshis)}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        Net: {formatSatoshi(withdrawal.net_amount_satoshis)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className="text-[10px] sm:text-xs">
                      {withdrawal.payment_currency || "BTC"}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(withdrawal.status)}</TableCell>
                  {showFraudDetails && (
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs sm:text-sm ${getFraudScoreColor(fraudScore)}`}>{fraudScore}</span>
                        {fraudScore >= 70 && <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="hidden md:table-cell text-[10px] sm:text-xs max-w-[120px] sm:max-w-[180px] truncate">
                    {withdrawal.profiles?.faucetpay_email || withdrawal.payment_address || "-"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {withdrawal.profiles?.referred_by ? (
                      <Link
                        href={`/admin/users?search=${withdrawal.profiles.referred_by}`}
                        className="text-[10px] sm:text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Users className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        {withdrawal.profiles.referred_by.slice(0, 8)}...
                      </Link>
                    ) : (
                      <span className="text-[10px] sm:text-xs text-muted-foreground">Direct</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[10px] sm:text-xs text-muted-foreground">
                    {formatRelativeTime(withdrawal.created_at)}
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Button size="sm" variant="ghost" className="h-6 w-6 sm:h-8 sm:w-8 p-0" asChild>
                          <Link href={`/admin/users?search=${withdrawal.user_id}`}>
                            <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 sm:h-8 sm:w-8 p-0 text-emerald-500 hover:text-emerald-600 bg-transparent"
                          onClick={() => setApproveTarget(withdrawal)}
                          disabled={loading === withdrawal.id}
                          aria-label="Approve withdrawal"
                        >
                          {loading === withdrawal.id ? (
                            <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                          )}
                        </Button>
                        <Dialog
                          open={rejectDialogOpen && selectedWithdrawal === withdrawal.id}
                          onOpenChange={(open) => {
                            setRejectDialogOpen(open)
                            if (open) setSelectedWithdrawal(withdrawal.id)
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 sm:h-8 sm:w-8 p-0 text-red-500 hover:text-red-600 bg-transparent"
                              disabled={loading === withdrawal.id}
                            >
                              <XCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-[95vw] sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle className="text-base sm:text-lg">Reject Withdrawal</DialogTitle>
                              <DialogDescription className="text-xs sm:text-sm">
                                Provide a reason for rejecting this withdrawal request.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 sm:space-y-4">
                              <div className="space-y-2">
                                <Label className="text-xs sm:text-sm">Rejection Reason</Label>
                                <Textarea
                                  placeholder="Enter reason for rejection..."
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  className="text-xs sm:text-sm min-h-[80px]"
                                />
                              </div>
                            </div>
                            <DialogFooter className="gap-2 sm:gap-0">
                              <Button
                                variant="outline"
                                onClick={() => setRejectDialogOpen(false)}
                                className="text-xs sm:text-sm"
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleAction(withdrawal.id, "reject", rejectReason)}
                                disabled={loading === withdrawal.id || !rejectReason.trim()}
                                className="text-xs sm:text-sm"
                              >
                                {loading === withdrawal.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Reject Withdrawal
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Approve confirmation — approving queues the payout for the FaucetPay
          worker; moving real money should not be a single accidental click. */}
      <AlertDialog open={!!approveTarget} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve withdrawal?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Approve{" "}
                  <strong className="text-emerald-600">
                    {approveTarget?.amount_satoshis?.toLocaleString()} sats
                  </strong>{" "}
                  to {approveTarget?.profiles?.faucetpay_email || approveTarget?.payment_address || "the user's FaucetPay wallet"}?
                </p>
                <p>The payout worker will send this payment. Once paid, it can no longer be rejected.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = approveTarget
                setApproveTarget(null)
                if (target) handleAction(target.id, "approve")
              }}
              disabled={loading !== null}
            >
              {loading ? "Approving…" : "Approve Payout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

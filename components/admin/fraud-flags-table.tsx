"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatRelativeTime } from "@/lib/utils"
import { CheckCircle, Ban, Eye, Loader2, Shield, Copy } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
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

interface FraudFlag {
  id: string
  user_id: string
  fraud_type: string
  severity: number
  evidence: Record<string, unknown> | null
  status: string
  created_at: string
  resolved_at?: string
  resolution_notes?: string
  action_taken?: string
  profiles?: {
    id?: string
    username?: string | null
    display_name?: string | null
    fraud_score?: number
    status?: string
    banned_at?: string | null
    total_claims?: number
    referral_count?: number
    referred_by?: string | null
    created_at?: string
    faucetpay_email?: string | null
  }
}

interface FraudFlagsTableProps {
  flags: FraudFlag[]
  showResolution?: boolean
}

export function FraudFlagsTable({ flags, showResolution }: FraudFlagsTableProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false)
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null)
  const [dismissReason, setDismissReason] = useState("")

  const handleAction = async (flagId: string, userId: string, action: "dismiss" | "ban", notes?: string) => {
    setLoading(flagId)
    try {
      const res = await fetch("/api/admin/fraud/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId, userId, action, notes }),
      })

      if (!res.ok) throw new Error("Action failed")

      toast.success(action === "ban" ? "User banned and flag resolved" : "Flag dismissed")
      setDismissDialogOpen(false)
      setDismissReason("")
      window.location.reload()
    } catch {
      toast.error("Failed to process action")
    } finally {
      setLoading(null)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  const getSeverityBadge = (severity: number) => {
    if (severity >= 80) {
      return (
        <Badge variant="destructive" className="text-[10px] sm:text-xs">
          Critical
        </Badge>
      )
    }
    if (severity >= 60) {
      return (
        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] sm:text-xs">High</Badge>
      )
    }
    if (severity >= 40) {
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] sm:text-xs">Medium</Badge>
    }
    return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] sm:text-xs">Low</Badge>
  }

  const getActionBadge = (action: string | undefined) => {
    switch (action) {
      case "banned":
        return (
          <Badge variant="destructive" className="text-[10px] sm:text-xs">
            Banned
          </Badge>
        )
      case "dismissed":
        return (
          <Badge variant="secondary" className="text-[10px] sm:text-xs">
            Dismissed
          </Badge>
        )
      case "warning":
        return <Badge className="bg-amber-500/20 text-amber-400 text-[10px] sm:text-xs">Warning</Badge>
      default:
        return (
          <Badge variant="outline" className="text-[10px] sm:text-xs">
            {action || "None"}
          </Badge>
        )
    }
  }

  if (flags.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12 text-muted-foreground">
        <Shield className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 text-emerald-500/50" />
        <p className="text-sm sm:text-base">
          {showResolution ? "No resolved flags in history" : "No pending fraud flags"}
        </p>
        {!showResolution && <p className="text-xs sm:text-sm mt-1">Great job keeping the platform safe!</p>}
      </div>
    )
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs sm:text-sm min-w-[130px]">User</TableHead>
            <TableHead className="text-xs sm:text-sm hidden md:table-cell">Email</TableHead>
            <TableHead className="text-xs sm:text-sm">Flag Type</TableHead>
            <TableHead className="text-xs sm:text-sm">Severity</TableHead>
            <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Fraud Score</TableHead>
            <TableHead className="text-xs sm:text-sm">{showResolution ? "Resolved" : "Detected"}</TableHead>
            {showResolution ? (
              <TableHead className="text-xs sm:text-sm">Action Taken</TableHead>
            ) : (
              <TableHead className="w-[120px] sm:w-[150px]">Actions</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {flags.map((flag) => {
            const isBanned = flag.profiles?.status === "banned" || !!flag.profiles?.banned_at
            const displayName =
              flag.profiles?.display_name || flag.profiles?.username || `User ${flag.user_id.slice(0, 8)}`

            return (
              <TableRow key={flag.id} className={flag.severity >= 80 ? "bg-red-500/5" : ""}>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-xs sm:text-sm truncate max-w-[80px] sm:max-w-[120px]">
                        {displayName}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => copyToClipboard(flag.user_id)}
                      >
                        <Copy className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                    {isBanned && (
                      <Badge variant="destructive" className="text-[10px]">
                        Banned
                      </Badge>
                    )}
                    <p className="text-[10px] text-muted-foreground">{flag.profiles?.total_claims || 0} claims</p>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                    {flag.profiles?.faucetpay_email && flag.profiles.faucetpay_email.trim() !== ""
                      ? flag.profiles.faucetpay_email
                      : "No email"}
                  </p>
                </TableCell>
                <TableCell>
                  <code className="text-[10px] sm:text-xs bg-muted px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">
                    {flag.fraud_type.replace(/_/g, " ")}
                  </code>
                </TableCell>
                <TableCell>{getSeverityBadge(flag.severity)}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span
                    className={`text-xs sm:text-sm font-medium ${
                      (flag.profiles?.fraud_score || 0) >= 70
                        ? "text-red-500"
                        : (flag.profiles?.fraud_score || 0) >= 40
                          ? "text-amber-500"
                          : "text-emerald-500"
                    }`}
                  >
                    {flag.profiles?.fraud_score || 0}
                  </span>
                </TableCell>
                <TableCell className="text-[10px] sm:text-xs text-muted-foreground">
                  {formatRelativeTime(showResolution && flag.resolved_at ? flag.resolved_at : flag.created_at)}
                </TableCell>
                {showResolution ? (
                  <TableCell>
                    <div className="space-y-1">
                      {getActionBadge(flag.action_taken)}
                      {flag.resolution_notes && (
                        <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                          {flag.resolution_notes}
                        </p>
                      )}
                    </div>
                  </TableCell>
                ) : (
                  <TableCell>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Button size="sm" variant="ghost" className="h-6 w-6 sm:h-8 sm:w-8 p-0" asChild>
                        <Link href={`/admin/users?search=${flag.user_id}`}>
                          <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Link>
                      </Button>

                      <Dialog
                        open={dismissDialogOpen && selectedFlag === flag.id}
                        onOpenChange={(open) => {
                          setDismissDialogOpen(open)
                          if (open) setSelectedFlag(flag.id)
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 w-6 sm:h-8 sm:w-8 p-0 text-emerald-500 bg-transparent"
                            disabled={loading === flag.id}
                          >
                            {loading === flag.id ? (
                              <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                            )}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-[95vw] sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle className="text-base sm:text-lg">Dismiss Flag</DialogTitle>
                            <DialogDescription className="text-xs sm:text-sm">
                              Provide a reason for dismissing this fraud flag.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <Label className="text-xs sm:text-sm">Dismissal Reason</Label>
                              <Textarea
                                placeholder="Enter reason for dismissal..."
                                value={dismissReason}
                                onChange={(e) => setDismissReason(e.target.value)}
                                className="text-xs sm:text-sm min-h-[80px]"
                              />
                            </div>
                          </div>
                          <DialogFooter className="gap-2 sm:gap-0">
                            <Button
                              variant="outline"
                              onClick={() => setDismissDialogOpen(false)}
                              className="text-xs sm:text-sm"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={() => handleAction(flag.id, flag.user_id, "dismiss", dismissReason)}
                              disabled={loading === flag.id}
                              className="text-xs sm:text-sm"
                            >
                              {loading === flag.id && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                              Dismiss Flag
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 w-6 sm:h-8 sm:w-8 p-0 text-red-500 bg-transparent"
                        onClick={() => handleAction(flag.id, flag.user_id, "ban")}
                        disabled={loading === flag.id || isBanned}
                      >
                        <Ban className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

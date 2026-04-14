"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import {
  DollarSign,
  Wallet,
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Plus,
  Minus,
  Edit,
  Zap,
  Rocket,
  Shield,
  Crown,
  AlertTriangle
} from "lucide-react"
import { toast } from "sonner"
import useSWR from "swr"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then(res => res.json())

const BOOSTER_TIERS = [
  { id: "basic", name: "Basic", icon: Zap, color: "text-blue-500" },
  { id: "pro", name: "Pro", icon: Rocket, color: "text-emerald-500" },
  { id: "elite", name: "Elite", icon: Shield, color: "text-amber-500" },
  { id: "legend", name: "Legend", icon: Crown, color: "text-fuchsia-500" }
]

export default function AdminFundsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [boosterDialogOpen, setBoosterDialogOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null)
  const [confirmMessage, setConfirmMessage] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  const [adjustForm, setAdjustForm] = useState({
    type: "satoshis" as "satoshis" | "ad_balance",
    action: "add" as "add" | "subtract" | "set",
    amount: "",
    reason: ""
  })

  const [boosterForm, setBoosterForm] = useState({
    tierId: "",
    durationDays: "",
    reason: ""
  })

  const { data: overviewData, mutate: refreshOverview } = useSWR(
    "/api/admin/funds?action=overview",
    fetcher,
    { refreshInterval: 30000 }
  )

  const { data: usersData, mutate: refreshUsers } = useSWR(
    `/api/admin/funds?action=users&search=${searchQuery}`,
    fetcher,
    { refreshInterval: 60000 }
  )

  const { data: pendingData, mutate: refreshPending } = useSWR(
    "/api/admin/funds?action=pending_payments",
    fetcher,
    { refreshInterval: 30000 }
  )

  const overview = overviewData?.overview
  const users = usersData?.users || []
  const pendingPayments = pendingData?.pendingPayments || []

  const executeWithConfirmation = async (action: () => Promise<void>, message: string) => {
    setPendingAction(() => action)
    setConfirmMessage(message)
    setConfirmDialogOpen(true)
  }

  const handleConfirmAction = async () => {
    if (pendingAction) {
      await pendingAction()
    }
    setConfirmDialogOpen(false)
    setPendingAction(null)
    setConfirmMessage("")
  }

  const performBalanceAdjustment = async () => {
    setIsProcessing(true)
    try {
      const response = await fetch("/api/admin/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust_balance",
          userId: selectedUser.id,
          type: adjustForm.type,
          action: adjustForm.action,
          amount: parseFloat(adjustForm.amount),
          reason: adjustForm.reason
        })
      })

      const data = await response.json()
      if (data.success) {
        toast.success("Balance adjusted successfully", {
          description: `${adjustForm.type === "satoshis" ? "Satoshi" : "Ad"} balance updated from ${data.previousValue} to ${data.newValue}`
        })
        setAdjustDialogOpen(false)
        setAdjustForm({ type: "satoshis", action: "add", amount: "", reason: "" })
        refreshUsers()
        refreshOverview()
      } else {
        toast.error(data.error || "Failed to adjust balance")
      }
    } catch {
      toast.error("Failed to adjust balance")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleAdjustBalance = () => {
    if (!selectedUser || !adjustForm.amount || !adjustForm.reason) {
      toast.error("Please fill in all fields")
      return
    }

    const actionText = adjustForm.action === "add" ? "Add" : adjustForm.action === "subtract" ? "Subtract" : "Set"
    const typeText = adjustForm.type === "satoshis" ? "satoshis" : "USD"
    const message = `${actionText} ${parseFloat(adjustForm.amount).toLocaleString()} ${typeText} ${adjustForm.action === "set" ? "as" : adjustForm.action === "add" ? "to" : "from"} ${selectedUser?.display_name || selectedUser?.username || "user"}'s balance?\n\nReason: ${adjustForm.reason}\n\nThis action is audited and cannot be undone.`

    executeWithConfirmation(performBalanceAdjustment, message)
  }

  const performGrantBooster = async () => {
    setIsProcessing(true)
    try {
      const response = await fetch("/api/admin/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "activate_booster",
          userId: selectedUser.id,
          boosterTierId: boosterForm.tierId,
          durationDays: boosterForm.durationDays ? parseInt(boosterForm.durationDays) : undefined,
          reason: boosterForm.reason
        })
      })

      const data = await response.json()
      if (data.success) {
        toast.success("Booster granted successfully", {
          description: `Booster will expire on ${new Date(data.expiresAt).toLocaleDateString()}`
        })
        setBoosterDialogOpen(false)
        setBoosterForm({ tierId: "", durationDays: "", reason: "" })
        refreshOverview()
      } else {
        toast.error(data.error || "Failed to grant booster")
      }
    } catch {
      toast.error("Failed to grant booster")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleGrantBooster = () => {
    if (!selectedUser || !boosterForm.tierId || !boosterForm.reason) {
      toast.error("Please fill in all fields")
      return
    }

    const tierName = BOOSTER_TIERS.find(t => t.id === boosterForm.tierId)?.name || boosterForm.tierId
    const duration = boosterForm.durationDays || "default"
    const message = `Grant ${tierName} booster to ${selectedUser?.display_name || selectedUser?.username || "user"} for ${duration} days?\n\nReason: ${boosterForm.reason}\n\nThis action is audited.`

    executeWithConfirmation(performGrantBooster, message)
  }

  const handlePaymentAction = async (purchaseId: string, action: "approve" | "reject", transactionHash?: string) => {
    setIsProcessing(true)
    try {
      const response = await fetch("/api/admin/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action === "approve" ? "approve_payment" : "reject_payment",
          purchaseId,
          transactionHash,
          reason: action === "reject" ? "Payment not verified" : undefined
        })
      })

      const data = await response.json()
      if (data.success) {
        toast.success(action === "approve" ? "Payment approved" : "Payment rejected")
        refreshPending()
        refreshOverview()
      } else {
        toast.error(data.error || `Failed to ${action} payment`)
      }
    } catch {
      toast.error(`Failed to ${action} payment`)
    } finally {
      setIsProcessing(false)
    }
  }

  const formatSatoshis = (sats: number) => {
    if (sats >= 100000000) return `${(sats / 100000000).toFixed(4)} BTC`
    if (sats >= 1000000) return `${(sats / 1000000).toFixed(2)}M sats`
    if (sats >= 1000) return `${(sats / 1000).toFixed(1)}K sats`
    return `${sats} sats`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Funds Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage user balances, boosters, and approve manual payments
          </p>
        </div>
        <Button onClick={() => { refreshOverview(); refreshUsers(); refreshPending(); }} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Wallet className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Satoshis</p>
                <p className="text-lg font-bold">{overview ? formatSatoshis(overview.totalSatoshis) : <Skeleton className="h-6 w-20" />}</p>
                <p className="text-xs text-muted-foreground">~${overview?.totalSatoshisUsd?.toFixed(2) || "0.00"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <DollarSign className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ad Balances</p>
                <p className="text-lg font-bold">${overview?.totalAdBalance?.toFixed(2) || <Skeleton className="h-6 w-16" />}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Booster Revenue</p>
                <p className="text-lg font-bold">${overview?.totalBoosterRevenue?.toFixed(2) || <Skeleton className="h-6 w-16" />}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Withdrawals</p>
                <p className="text-lg font-bold">{overview ? formatSatoshis(overview.pendingWithdrawals) : <Skeleton className="h-6 w-20" />}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">User Balances</TabsTrigger>
          <TabsTrigger value="pending" className="relative">
            Pending Payments
            {pendingPayments.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                {pendingPayments.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Users Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Satoshi Balance</TableHead>
                    <TableHead>Ad Balance</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {searchQuery ? "No users found matching your search" : "Loading users..."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user: any) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{user.display_name || user.username || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">
                          {formatSatoshis(Number(user.balance_satoshis || 0))}
                        </TableCell>
                        <TableCell className="font-mono">
                          ${Number(user.ad_balance_usd || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.role === "admin" || user.role === "superadmin" ? "default" : "secondary"}>
                            {user.role || "user"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user)
                                setAdjustDialogOpen(true)
                              }}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Adjust
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user)
                                setBoosterDialogOpen(true)
                              }}
                            >
                              <Zap className="h-3 w-3 mr-1" />
                              Booster
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Pending Manual Crypto Payments
              </CardTitle>
              <CardDescription>
                Review and approve manual crypto payments for booster purchases
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingPayments.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500/30 mb-4" />
                  <p className="text-muted-foreground">No pending payments to review</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Booster</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPayments.map((payment: any) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{payment.profiles?.display_name || payment.profiles?.username || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">{payment.profiles?.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{payment.booster_tiers?.name || "Unknown"}</Badge>
                        </TableCell>
                        <TableCell className="font-mono">${payment.amount_usd?.toFixed(2)}</TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[120px]">
                          {payment.payment_reference}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(payment.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handlePaymentAction(payment.id, "approve")}
                              disabled={isProcessing}
                            >
                              {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                              Approve
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handlePaymentAction(payment.id, "reject")}
                              disabled={isProcessing}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Adjust Balance Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust User Balance</DialogTitle>
            <DialogDescription>
              Adjust balance for {selectedUser?.display_name || selectedUser?.username || "user"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Balance Type</Label>
              <Select value={adjustForm.type} onValueChange={(v: any) => setAdjustForm(f => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="satoshis">Satoshi Balance</SelectItem>
                  <SelectItem value="ad_balance">Advertising Balance (USD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={adjustForm.action} onValueChange={(v: any) => setAdjustForm(f => ({ ...f, action: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add to Balance</SelectItem>
                  <SelectItem value="subtract">Subtract from Balance</SelectItem>
                  <SelectItem value="set">Set Exact Balance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount {adjustForm.type === "satoshis" ? "(satoshis)" : "(USD)"}</Label>
              <Input
                type="number"
                placeholder={adjustForm.type === "satoshis" ? "Enter satoshis" : "Enter USD amount"}
                value={adjustForm.amount}
                onChange={(e) => setAdjustForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason (required)</Label>
              <Textarea
                placeholder="Enter reason for adjustment..."
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdjustBalance} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Adjust Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant Booster Dialog */}
      <Dialog open={boosterDialogOpen} onOpenChange={setBoosterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Booster</DialogTitle>
            <DialogDescription>
              Grant a free booster to {selectedUser?.display_name || selectedUser?.username || "user"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Booster Tier</Label>
              <Select value={boosterForm.tierId} onValueChange={(v) => setBoosterForm(f => ({ ...f, tierId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  {BOOSTER_TIERS.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      <div className="flex items-center gap-2">
                        <tier.icon className={cn("h-4 w-4", tier.color)} />
                        {tier.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Custom Duration (days, optional)</Label>
              <Input
                type="number"
                placeholder="Leave empty for default duration"
                value={boosterForm.durationDays}
                onChange={(e) => setBoosterForm(f => ({ ...f, durationDays: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason (required)</Label>
              <Textarea
                placeholder="Enter reason for granting booster..."
                value={boosterForm.reason}
                onChange={(e) => setBoosterForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoosterDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGrantBooster} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Grant Booster
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Critical Actions */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Shield className="h-5 w-5" />
              Confirm Critical Action
            </DialogTitle>
          </DialogHeader>
          <Alert variant="destructive" className="my-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription className="whitespace-pre-line text-sm">
              {confirmMessage}
            </AlertDescription>
          </Alert>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDialogOpen(false)
                setPendingAction(null)
                setConfirmMessage("")
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmAction}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirm Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

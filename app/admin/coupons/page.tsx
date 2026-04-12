"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  Ticket,
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  Loader2,
  Download,
  Sparkles,
  Clock,
  Users,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
} from "lucide-react"

interface Coupon {
  id: string
  code: string
  description: string
  reward_satoshis: number
  max_uses: number
  current_uses: number
  expires_at: string | null
  is_active: boolean
  is_demo: boolean
  created_at: string
}

interface CouponStats {
  totalCoupons: number
  activeCoupons: number
  totalRedemptions: number
  totalSatoshisGiven: number
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [stats, setStats] = useState<CouponStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showBulkDialog, setShowBulkDialog] = useState(false)
  const [filter, setFilter] = useState<"all" | "active" | "expired" | "depleted">("all")

  // Single coupon form
  const [newCoupon, setNewCoupon] = useState({
    code: "",
    description: "",
    reward_satoshis: 50,
    max_uses: 100,
    expires_days: 30,
    is_active: true,
  })

  // Bulk generate form
  const [bulkForm, setBulkForm] = useState({
    count: 10,
    description: "Generated coupon",
    reward_satoshis: 50,
    max_uses: 10,
    expires_days: 30,
  })

  const fetchCoupons = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/admin/coupons")
      const data = await res.json()

      if (!res.ok) {
        // If database not configured, show empty state without error toast
        if (data.error === "Database not configured") {
          setCoupons([])
          setStats({ totalCoupons: 0, activeCoupons: 0, totalRedemptions: 0, totalSatoshisGiven: 0 })
          return
        }
        throw new Error(data.error || "Failed to fetch")
      }

      setCoupons(data.coupons || [])
      setStats(data.stats || { totalCoupons: 0, activeCoupons: 0, totalRedemptions: 0, totalSatoshisGiven: 0 })
    } catch (err) {
      console.error("[Admin Coupons] Fetch error:", err)
      toast.error("Failed to load coupons")
      setCoupons([])
      setStats({ totalCoupons: 0, activeCoupons: 0, totalRedemptions: 0, totalSatoshisGiven: 0 })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCoupons()
  }, [fetchCoupons])

  const generateSecureCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    let code = ""
    for (let i = 0; i < 12; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    return code
  }

  const handleCreateSingle = async () => {
    if (!newCoupon.code.trim()) {
      toast.error("Please enter a coupon code")
      return
    }
    setIsCreating(true)
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newCoupon,
          code: newCoupon.code.toUpperCase().trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create")
      toast.success("Coupon created successfully")
      setShowCreateDialog(false)
      setNewCoupon({
        code: "",
        description: "",
        reward_satoshis: 50,
        max_uses: 100,
        expires_days: 30,
        is_active: true,
      })
      fetchCoupons()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create coupon")
    } finally {
      setIsCreating(false)
    }
  }

  const handleBulkGenerate = async () => {
    setIsGenerating(true)
    try {
      const res = await fetch("/api/admin/coupons/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bulkForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to generate")
      toast.success(`Generated ${data.count} coupons successfully`)
      setShowBulkDialog(false)
      fetchCoupons()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate coupons")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !coupon.is_active }),
      })
      if (!res.ok) throw new Error("Failed to update")
      toast.success(coupon.is_active ? "Coupon deactivated" : "Coupon activated")
      fetchCoupons()
    } catch {
      toast.error("Failed to update coupon")
    }
  }

  const handleDelete = async (couponId: string) => {
    if (!confirm("Are you sure you want to delete this coupon?")) return
    try {
      const res = await fetch(`/api/admin/coupons/${couponId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("Coupon deleted")
      fetchCoupons()
    } catch {
      toast.error("Failed to delete coupon")
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast.success("Code copied to clipboard")
  }

  const exportCoupons = () => {
    const csv = [
      ["Code", "Description", "Reward (sats)", "Max Uses", "Used", "Remaining", "Expires", "Active"].join(","),
      ...coupons.map((c) =>
        [
          c.code,
          `"${c.description}"`,
          c.reward_satoshis,
          c.max_uses,
          c.current_uses || 0,
          c.max_uses - (c.current_uses || 0),
          c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never",
          c.is_active ? "Yes" : "No",
        ].join(",")
      ),
    ].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `coupons-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredCoupons = coupons.filter((coupon) => {
    const remaining = coupon.max_uses - (coupon.current_uses || 0)
    if (filter === "active") return coupon.is_active && remaining > 0
    if (filter === "expired") return coupon.expires_at && new Date(coupon.expires_at) < new Date()
    if (filter === "depleted") return remaining <= 0
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Coupon Management</h1>
          <p className="text-muted-foreground">Create and manage promotional coupon codes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCoupons} disabled={coupons.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={fetchCoupons}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Sparkles className="h-4 w-4 mr-2" />
                Bulk Generate
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Bulk Generate Coupons</DialogTitle>
                <DialogDescription>
                  Generate multiple coupons with secure 12-character codes
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Number of Coupons</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={bulkForm.count}
                    onChange={(e) => setBulkForm({ ...bulkForm, count: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Input
                    value={bulkForm.description}
                    onChange={(e) => setBulkForm({ ...bulkForm, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Reward (satoshis)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={bulkForm.reward_satoshis}
                      onChange={(e) => setBulkForm({ ...bulkForm, reward_satoshis: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Max Uses Each</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={bulkForm.max_uses}
                      onChange={(e) => setBulkForm({ ...bulkForm, max_uses: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Expires In (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={bulkForm.expires_days}
                    onChange={(e) => setBulkForm({ ...bulkForm, expires_days: parseInt(e.target.value) || 30 })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBulkDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleBulkGenerate} disabled={isGenerating}>
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Generate {bulkForm.count} Coupons
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Coupon
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Coupon</DialogTitle>
                <DialogDescription>
                  Create a new promotional coupon code
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Coupon Code</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newCoupon.code}
                      onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
                      placeholder="WELCOME2024"
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setNewCoupon({ ...newCoupon, code: generateSecureCode() })}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Input
                    value={newCoupon.description}
                    onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })}
                    placeholder="Welcome bonus for new users"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Reward (satoshis)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={newCoupon.reward_satoshis}
                      onChange={(e) => setNewCoupon({ ...newCoupon, reward_satoshis: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Max Uses</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100000}
                      value={newCoupon.max_uses}
                      onChange={(e) => setNewCoupon({ ...newCoupon, max_uses: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Expires In (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={newCoupon.expires_days}
                    onChange={(e) => setNewCoupon({ ...newCoupon, expires_days: parseInt(e.target.value) || 30 })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch
                    checked={newCoupon.is_active}
                    onCheckedChange={(checked) => setNewCoupon({ ...newCoupon, is_active: checked })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateSingle} disabled={isCreating}>
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Create Coupon
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Coupons</CardTitle>
              <Ticket className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalCoupons}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Coupons</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.activeCoupons}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Redemptions</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalRedemptions.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Satoshis Given</CardTitle>
              <Sparkles className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSatoshisGiven.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Coupons Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Coupons</CardTitle>
              <CardDescription>Manage all promotional codes</CardDescription>
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Coupons</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="depleted">Depleted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCoupons.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No coupons found
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <div className="inline-block min-w-full align-middle px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead className="hidden sm:table-cell">Description</TableHead>
                      <TableHead>Reward</TableHead>
                      <TableHead className="hidden md:table-cell">Uses</TableHead>
                      <TableHead className="hidden lg:table-cell">Expires</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCoupons.map((coupon) => (
                      <TableRow key={coupon.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs sm:text-sm bg-muted px-2 py-1 rounded font-mono">
                              {coupon.code}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyCode(coupon.code)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell max-w-[200px] truncate">
                          {coupon.description}
                        </TableCell>
                        <TableCell className="font-mono text-xs sm:text-sm">
                          {coupon.reward_satoshis} sats
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className={(coupon.current_uses || 0) >= coupon.max_uses ? "text-destructive" : ""}>
                            {coupon.current_uses || 0}/{coupon.max_uses}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">
                          {coupon.expires_at
                            ? new Date(coupon.expires_at).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          {(coupon.current_uses || 0) >= coupon.max_uses ? (
                            <Badge variant="secondary">Depleted</Badge>
                          ) : coupon.expires_at && new Date(coupon.expires_at) < new Date() ? (
                            <Badge variant="destructive">Expired</Badge>
                          ) : coupon.is_active ? (
                            <Badge variant="default" className="bg-green-600">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleToggleActive(coupon)}
                            >
                              {coupon.is_active ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(coupon.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

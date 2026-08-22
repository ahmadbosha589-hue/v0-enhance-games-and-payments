"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { X, Filter, User, Users, DollarSign, Shield } from "lucide-react"
import { useState, useTransition } from "react"

export function WithdrawalsFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [filters, setFilters] = useState({
    userId: searchParams.get("userId") || "",
    referralId: searchParams.get("referralId") || "",
    minAmount: searchParams.get("minAmount") || "",
    maxAmount: searchParams.get("maxAmount") || "",
    minFraudScore: searchParams.get("minFraudScore") || "",
    maxFraudScore: searchParams.get("maxFraudScore") || "",
    flagged: searchParams.get("flagged") || "all",
    currency: searchParams.get("currency") || "all",
  })

  const updateFilters = () => {
    const params = new URLSearchParams()

    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "all") {
        params.set(key, value)
      }
    })

    // Preserve the active tab — rebuilding params from scratch used to drop
    // `tab` and bounce the operator back to Pending on every Apply.
    const activeTab = searchParams.get("tab")
    if (activeTab) params.set("tab", activeTab)

    startTransition(() => {
      router.push(`/admin/withdrawals?${params.toString()}`)
    })
  }

  const clearFilters = () => {
    setFilters({
      userId: "",
      referralId: "",
      minAmount: "",
      maxAmount: "",
      minFraudScore: "",
      maxFraudScore: "",
      flagged: "all",
      currency: "all",
    })
    startTransition(() => {
      router.push("/admin/withdrawals")
    })
  }

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === "flagged" || key === "currency") return value !== "all"
    return !!value
  })

  return (
    <div className="space-y-4">
      {/* Row 1: User ID and Referral ID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs sm:text-sm flex items-center gap-1.5">
            <User className="h-3 w-3 sm:h-4 sm:w-4" />
            User ID
          </Label>
          <Input
            placeholder="Filter by user UUID..."
            value={filters.userId}
            onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
            className="text-xs sm:text-sm h-8 sm:h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs sm:text-sm flex items-center gap-1.5">
            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
            Referrer ID
          </Label>
          <Input
            placeholder="Filter by referrer UUID..."
            value={filters.referralId}
            onChange={(e) => setFilters({ ...filters, referralId: e.target.value })}
            className="text-xs sm:text-sm h-8 sm:h-10"
          />
        </div>
      </div>

      {/* Row 2: Amount Range */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs sm:text-sm flex items-center gap-1.5">
            <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
            Min Amount (sats)
          </Label>
          <Input
            type="number"
            placeholder="0"
            value={filters.minAmount}
            onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
            className="text-xs sm:text-sm h-8 sm:h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs sm:text-sm">Max Amount (sats)</Label>
          <Input
            type="number"
            placeholder="∞"
            value={filters.maxAmount}
            onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
            className="text-xs sm:text-sm h-8 sm:h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs sm:text-sm flex items-center gap-1.5">
            <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
            Min Fraud Score
          </Label>
          <Input
            type="number"
            placeholder="0"
            min="0"
            max="100"
            value={filters.minFraudScore}
            onChange={(e) => setFilters({ ...filters, minFraudScore: e.target.value })}
            className="text-xs sm:text-sm h-8 sm:h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs sm:text-sm">Max Fraud Score</Label>
          <Input
            type="number"
            placeholder="100"
            min="0"
            max="100"
            value={filters.maxFraudScore}
            onChange={(e) => setFilters({ ...filters, maxFraudScore: e.target.value })}
            className="text-xs sm:text-sm h-8 sm:h-10"
          />
        </div>
      </div>

      {/* Row 3: Dropdowns and Actions */}
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <div className="space-y-1.5 min-w-[120px]">
          <Label className="text-xs sm:text-sm">Flagged Status</Label>
          <Select value={filters.flagged} onValueChange={(v) => setFilters({ ...filters, flagged: v })}>
            <SelectTrigger className="text-xs sm:text-sm h-8 sm:h-10">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="true">Flagged Only</SelectItem>
              <SelectItem value="false">Not Flagged</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 min-w-[120px]">
          <Label className="text-xs sm:text-sm">Currency</Label>
          <Select value={filters.currency} onValueChange={(v) => setFilters({ ...filters, currency: v })}>
            <SelectTrigger className="text-xs sm:text-sm h-8 sm:h-10">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Currencies</SelectItem>
              <SelectItem value="BTC">BTC</SelectItem>
              <SelectItem value="LTC">LTC</SelectItem>
              <SelectItem value="DOGE">DOGE</SelectItem>
              <SelectItem value="TRX">TRX</SelectItem>
              <SelectItem value="USDT">USDT</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={updateFilters} disabled={isPending} className="h-8 sm:h-10 text-xs sm:text-sm">
          <Filter className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4" />
          Apply Filters
        </Button>

        {hasActiveFilters && (
          <Button variant="outline" onClick={clearFilters} className="h-8 sm:h-10 text-xs sm:text-sm bg-transparent">
            <X className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4" />
            Clear All
          </Button>
        )}
      </div>
    </div>
  )
}

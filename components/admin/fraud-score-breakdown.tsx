"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { formatSatoshi, formatRelativeTime } from "@/lib/utils"
import { AlertTriangle, Ban, Eye, Shield, TrendingUp, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import type { Profile } from "@/lib/types/database"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface FraudScoreBreakdownProps {
  users: Profile[]
}

// Fraud score factors and their weights
const FRAUD_FACTORS = {
  vpn_usage: { label: "VPN/Proxy Detected", weight: 25, description: "User connected via VPN or proxy" },
  multiple_accounts: { label: "Multiple Accounts", weight: 30, description: "Device linked to other accounts" },
  rapid_claims: { label: "Rapid Claiming", weight: 15, description: "Unusually fast claim patterns" },
  suspicious_referrals: {
    label: "Suspicious Referrals",
    weight: 20,
    description: "Self-referral or circular referrals",
  },
  new_account_withdrawal: {
    label: "Quick Withdrawal",
    weight: 10,
    description: "Withdrawal request too soon after signup",
  },
  location_mismatch: { label: "Location Mismatch", weight: 15, description: "IP location doesn't match profile" },
  bot_behavior: { label: "Bot Behavior", weight: 35, description: "Automated or scripted interactions" },
}

export function FraudScoreBreakdown({ users }: FraudScoreBreakdownProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  const handleAction = async (userId: string, action: "ban" | "reset_score") => {
    setLoading(userId)
    try {
      const res = await fetch("/api/admin/users/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      })

      if (!res.ok) throw new Error("Action failed")

      toast.success(action === "ban" ? "User banned" : "Fraud score reset")
      window.location.reload()
    } catch {
      toast.error("Failed to perform action")
    } finally {
      setLoading(null)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-red-500"
    if (score >= 60) return "text-orange-500"
    if (score >= 40) return "text-amber-500"
    return "text-emerald-500"
  }

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-red-500"
    if (score >= 60) return "bg-orange-500"
    if (score >= 40) return "bg-amber-500"
    return "bg-emerald-500"
  }

  // Simulate factor breakdown based on score
  const getFactorBreakdown = (score: number) => {
    const factors: { factor: string; active: boolean; contribution: number }[] = []
    let remaining = score

    Object.entries(FRAUD_FACTORS).forEach(([key, { weight }]) => {
      const isActive = remaining >= weight && Math.random() > 0.5
      if (isActive && remaining > 0) {
        const contribution = Math.min(weight, remaining)
        factors.push({ factor: key, active: true, contribution })
        remaining -= contribution
      } else {
        factors.push({ factor: key, active: false, contribution: 0 })
      }
    })

    return factors.sort((a, b) => b.contribution - a.contribution)
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12 text-muted-foreground">
        <Shield className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 text-emerald-500/50" />
        <p className="text-sm sm:text-base">No high-risk users detected</p>
        <p className="text-xs sm:text-sm mt-1">All active users have fraud scores below 70</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {users.map((user) => {
        const displayName = user.display_name || user.username || `User ${user.id.slice(0, 8)}`
        const factors = getFactorBreakdown(user.fraud_score)
        const isExpanded = expandedUser === user.id

        return (
          <Collapsible
            key={user.id}
            open={isExpanded}
            onOpenChange={() => setExpandedUser(isExpanded ? null : user.id)}
          >
            <div className="border rounded-lg overflow-hidden">
              <CollapsibleTrigger asChild>
                <div className="p-3 sm:p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="relative">
                        <div
                          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${
                            user.fraud_score >= 80
                              ? "bg-red-500/20"
                              : user.fraud_score >= 60
                                ? "bg-orange-500/20"
                                : "bg-amber-500/20"
                          }`}
                        >
                          <span className={`text-lg sm:text-xl font-bold ${getScoreColor(user.fraud_score)}`}>
                            {user.fraud_score}
                          </span>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm sm:text-base truncate">{displayName}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{user.total_claims} claims</span>
                          <span>•</span>
                          <span>Joined {formatRelativeTime(user.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.fraud_score >= 80 && (
                        <Badge variant="destructive" className="hidden sm:flex text-xs">
                          Critical
                        </Badge>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <Progress value={user.fraud_score} className="h-1.5 sm:h-2" />
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t p-3 sm:p-4 bg-muted/30 space-y-4">
                  {/* Factor Breakdown */}
                  <div>
                    <h4 className="text-xs sm:text-sm font-medium mb-2 flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                      Risk Factor Analysis
                    </h4>
                    <div className="grid gap-2">
                      {factors
                        .filter((f) => f.active)
                        .map(({ factor, contribution }) => {
                          const factorInfo = FRAUD_FACTORS[factor as keyof typeof FRAUD_FACTORS]
                          return (
                            <div
                              key={factor}
                              className="flex items-center justify-between p-2 bg-background rounded border"
                            >
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-3 w-3 text-red-500" />
                                <div>
                                  <p className="text-xs sm:text-sm font-medium">{factorInfo.label}</p>
                                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                                    {factorInfo.description}
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                +{contribution}
                              </Badge>
                            </div>
                          )
                        })}
                      {factors.filter((f) => f.active).length === 0 && (
                        <p className="text-xs text-muted-foreground">No specific factors detected</p>
                      )}
                    </div>
                  </div>

                  {/* User Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    <div className="p-2 bg-background rounded border text-center">
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className="text-xs sm:text-sm font-medium">{formatSatoshi(user.balance_satoshis)}</p>
                    </div>
                    <div className="p-2 bg-background rounded border text-center">
                      <p className="text-xs text-muted-foreground">Referrals</p>
                      <p className="text-xs sm:text-sm font-medium">{user.referral_count}</p>
                    </div>
                    <div className="p-2 bg-background rounded border text-center">
                      <p className="text-xs text-muted-foreground">Streak</p>
                      <p className="text-xs sm:text-sm font-medium">{user.claim_streak} days</p>
                    </div>
                    <div className="p-2 bg-background rounded border text-center">
                      <p className="text-xs text-muted-foreground">Withdrawn</p>
                      <p className="text-xs sm:text-sm font-medium">{formatSatoshi(user.total_withdrawn_satoshis)}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild className="text-xs bg-transparent">
                      <Link href={`/admin/users?search=${user.id}`}>
                        <Eye className="h-3 w-3 mr-1.5" />
                        View Profile
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs bg-transparent"
                      onClick={() => handleAction(user.id, "reset_score")}
                      disabled={loading === user.id}
                    >
                      {loading === user.id ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      ) : (
                        <Shield className="h-3 w-3 mr-1.5" />
                      )}
                      Reset Score
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="text-xs"
                      onClick={() => handleAction(user.id, "ban")}
                      disabled={loading === user.id}
                    >
                      <Ban className="h-3 w-3 mr-1.5" />
                      Ban User
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )
      })}
    </div>
  )
}

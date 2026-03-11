"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Eye, Ban, CheckCircle, Loader2, RefreshCw, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { formatRelativeTime } from "@/lib/utils"
import { toast } from "sonner"

interface FraudFlag {
  id: string
  user_id: string
  fraud_type: string
  severity: number
  created_at: string
  status: string
}

export function FraudAlerts() {
  const [alerts, setAlerts] = useState<FraudFlag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from("fraud_flags")
        .select("id, user_id, fraud_type, severity, created_at, status")
        .eq("status", "pending")
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5)
        .abortSignal(controller.signal)

      clearTimeout(timeoutId)

      if (error) {
        setAlerts([])
      } else {
        setAlerts(data || [])
      }
    } catch {
      setAlerts([])
    } finally {
      clearTimeout(timeoutId)
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  async function handleDismiss(flagId: string) {
    setActionLoading(flagId)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("fraud_flags").update({ status: "dismissed" }).eq("id", flagId)

      if (error) throw error

      toast.success("Fraud flag dismissed")
      fetchAlerts()
    } catch {
      toast.error("Failed to dismiss flag")
    } finally {
      setActionLoading(null)
    }
  }

  async function handleBan(flagId: string, userId: string) {
    setActionLoading(flagId)
    try {
      const supabase = createClient()

      await supabase.from("profiles").update({ status: "banned" }).eq("id", userId)
      await supabase.from("fraud_flags").update({ status: "actioned" }).eq("id", flagId)

      toast.success("User banned successfully")
      fetchAlerts()
    } catch {
      toast.error("Failed to ban user")
    } finally {
      setActionLoading(null)
    }
  }

  function getSeverityLabel(severity: number): string {
    if (severity >= 80) return "critical"
    if (severity >= 60) return "high"
    if (severity >= 40) return "medium"
    return "low"
  }

  function getSeverityVariant(severity: number): "destructive" | "default" | "secondary" {
    if (severity >= 60) return "destructive"
    if (severity >= 40) return "default"
    return "secondary"
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
            Fraud Alerts
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Loading alerts...</CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 sm:p-6">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
            Fraud Alerts
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Users flagged for suspicious activity</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchAlerts} className="h-8 w-8">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" asChild className="text-xs sm:text-sm bg-transparent">
            <Link href="/admin/fraud">View All</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        <div className="space-y-3 sm:space-y-4">
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShieldCheck className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
              <p className="text-sm font-medium">All Clear</p>
              <p className="text-xs text-muted-foreground">No pending fraud alerts</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 p-2 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-xs sm:text-sm font-mono">{alert.user_id.slice(0, 8)}...</span>
                    <Badge variant={getSeverityVariant(alert.severity)} className="text-xs">
                      {getSeverityLabel(alert.severity)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{alert.fraud_type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(alert.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <p className="text-xs text-muted-foreground">Severity</p>
                    <p
                      className={`font-bold text-sm ${
                        alert.severity >= 70
                          ? "text-red-500"
                          : alert.severity >= 40
                            ? "text-amber-500"
                            : "text-emerald-500"
                      }`}
                    >
                      {alert.severity}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                    <Link href={`/admin/users?search=${alert.user_id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={actionLoading === alert.id}
                    onClick={() => handleDismiss(alert.id)}
                  >
                    {actionLoading === alert.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={actionLoading === alert.id}
                    onClick={() => handleBan(alert.id, alert.user_id)}
                  >
                    <Ban className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

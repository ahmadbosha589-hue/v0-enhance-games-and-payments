"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { formatSatoshi, formatRelativeTime } from "@/lib/utils"
import {
  Coins,
  CreditCard,
  UserPlus,
  AlertTriangle,
  Shield,
  Loader2,
  Inbox,
  RefreshCw,
  Activity,
  Trophy,
} from "lucide-react"

const activityIcons = {
  claim: Coins,
  withdrawal: CreditCard,
  signup: UserPlus,
  user_created: UserPlus,
  user_flagged: AlertTriangle,
  user_banned: AlertTriangle,
  withdrawal_approved: CreditCard,
  withdrawal_rejected: CreditCard,
  fraud_flag: AlertTriangle,
  admin_action: Shield,
  achievement: Trophy,
}

interface AuditLog {
  id: string
  action: string
  resource_type: string
  resource_id: string | null
  actor_id: string | null
  created_at: string
  metadata: {
    amount?: number
    username?: string
    [key: string]: unknown
  } | null
}

export function RecentActivity() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
      const supabase = createClient()

      const { data: auditLogs, error: queryError } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10)
        .abortSignal(controller.signal)

      clearTimeout(timeoutId)

      if (queryError) {
        setLogs([])
      } else {
        setLogs(auditLogs || [])
      }
    } catch {
      setLogs([])
    } finally {
      clearTimeout(timeoutId)
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Loading activity...</CardDescription>
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
            <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Latest platform events and actions</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchLogs} className="h-8 w-8">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        <div className="space-y-3 sm:space-y-4">
          {logs && logs.length > 0 ? (
            logs.map((log) => {
              const Icon = activityIcons[log.action as keyof typeof activityIcons] || Shield
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-3 sm:gap-4 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-muted shrink-0">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium truncate">
                      {log.metadata?.username || (log.actor_id ? `User ${log.actor_id.slice(0, 8)}...` : "System")}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{log.action.replace(/_/g, " ")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {log.metadata?.amount && (
                      <p className="text-xs sm:text-sm font-medium">{formatSatoshi(log.metadata.amount)}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(log.created_at)}</p>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No Activity Yet</p>
              <p className="text-xs text-muted-foreground">
                Activity will appear here as users interact with the platform
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

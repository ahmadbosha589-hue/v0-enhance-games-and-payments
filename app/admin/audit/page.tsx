import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatRelativeTime } from "@/lib/utils"
import { ArrowRight, User, Shield, AlertTriangle } from "lucide-react"

export const dynamic = "force-dynamic"

interface AuditLog {
  id: string
  actor_id: string | null
  actor_role: string | null
  actor_ip: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
  // Joined data
  actor_profile?: {
    username: string | null
    display_name: string | null
    faucetpay_email: string | null
  } | null
  target_profile?: {
    username: string | null
    display_name: string | null
    faucetpay_email: string | null
  } | null
}

export default async function AuditLogsPage() {
  const supabase = createAdminClient()

  if (!supabase) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground">Database connection not configured</p>
        </div>
      </div>
    )
  }

  const { data: logs } = await supabase
    .from("audit_logs")
    .select(`
      *,
      actor_profile:profiles!audit_logs_actor_id_fkey(username, display_name, faucetpay_email)
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  const logsWithTargets: AuditLog[] = []
  if (logs) {
    for (const log of logs) {
      const targetUserId = log.metadata?.target_user_id || log.metadata?.withdrawal_user_id
      let targetProfile = null

      if (targetUserId && typeof targetUserId === "string") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, display_name, faucetpay_email")
          .eq("id", targetUserId)
          .single()
        targetProfile = profile
      }

      logsWithTargets.push({
        ...log,
        target_profile: targetProfile,
      })
    }
  }

  const getActionBadge = (action: string) => {
    if (action.includes("ban")) return <Badge variant="destructive">{action}</Badge>
    if (action.includes("withdraw")) return <Badge className="bg-blue-500/20 text-blue-400">{action}</Badge>
    if (action.includes("claim")) return <Badge className="bg-emerald-500/20 text-emerald-400">{action}</Badge>
    if (action.includes("fraud")) return <Badge className="bg-amber-500/20 text-amber-400">{action}</Badge>
    if (action.includes("admin") || action.includes("settings"))
      return <Badge className="bg-purple-500/20 text-purple-400">{action}</Badge>
    if (action.includes("unban") || action.includes("unflag"))
      return <Badge className="bg-emerald-500/20 text-emerald-400">{action}</Badge>
    return <Badge variant="secondary">{action}</Badge>
  }

  const getDisplayName = (
    profile: { username?: string | null; display_name?: string | null; faucetpay_email?: string | null } | null,
    id?: string | null,
  ) => {
    if (!profile && !id) return "System"
    if (profile?.display_name) return profile.display_name
    if (profile?.username) return profile.username
    if (profile?.faucetpay_email) return profile.faucetpay_email
    if (id) return `${id.slice(0, 8)}...`
    return "Unknown"
  }

  const getEmail = (profile: { faucetpay_email?: string | null } | null) => {
    return profile?.faucetpay_email || "No email"
  }

  const renderValueChange = (oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) => {
    if (!oldData && !newData) return null

    const changes: { key: string; old: unknown; new: unknown }[] = []
    const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})])

    for (const key of allKeys) {
      const oldVal = oldData?.[key]
      const newVal = newData?.[key]
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ key, old: oldVal, new: newVal })
      }
    }

    if (changes.length === 0) return null

    return (
      <div className="space-y-1">
        {changes.slice(0, 3).map((change, i) => (
          <div key={i} className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">{change.key}:</span>
            <span className="text-red-400 line-through">{formatValue(change.old)}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-emerald-400">{formatValue(change.new)}</span>
          </div>
        ))}
        {changes.length > 3 && (
          <span className="text-xs text-muted-foreground">+{changes.length - 3} more changes</span>
        )}
      </div>
    )
  }

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return "null"
    if (typeof val === "boolean") return val ? "true" : "false"
    if (typeof val === "object") return JSON.stringify(val).slice(0, 30)
    return String(val).slice(0, 30)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">Complete history of all admin actions with full accountability</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>Last 100 logged events - immutable audit trail</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[100px]">Time</TableHead>
                  <TableHead className="min-w-[150px]">Admin (Actor)</TableHead>
                  <TableHead className="min-w-[120px]">Action</TableHead>
                  <TableHead className="min-w-[150px]">Target User</TableHead>
                  <TableHead className="min-w-[100px]">IP Address</TableHead>
                  <TableHead className="min-w-[200px]">Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsWithTargets?.map((log) => {
                  const targetUserId = log.metadata?.target_user_id || log.metadata?.withdrawal_user_id

                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatRelativeTime(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-purple-400" />
                            <span className="font-medium text-sm">
                              {getDisplayName(log.actor_profile, log.actor_id)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{getEmail(log.actor_profile)}</p>
                          {log.actor_role && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {log.actor_role}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell>
                        {targetUserId ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle className="h-3 w-3 text-amber-400" />
                              <span className="font-medium text-sm">
                                {getDisplayName(log.target_profile, targetUserId as string)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">{getEmail(log.target_profile)}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.actor_ip || "-"}</TableCell>
                      <TableCell className="max-w-[250px]">
                        {renderValueChange(log.old_data, log.new_data) || (
                          <span className="text-xs text-muted-foreground">
                            {log.metadata ? JSON.stringify(log.metadata).slice(0, 50) + "..." : "-"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {(!logsWithTargets || logsWithTargets.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bell, Send, Clock, CheckCircle, AlertTriangle, Loader2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

interface Notification {
  id: string
  user_id: string | null
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [stats, setStats] = useState({ total: 0, unread: 0, today: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [supabaseError, setSupabaseError] = useState(false)

  // Form state — default must be a valid notification_type enum value
  const [notifType, setNotifType] = useState("system_announcement")
  const [notifTitle, setNotifTitle] = useState("")
  const [notifMessage, setNotifMessage] = useState("")
  const [targetAudience, setTargetAudience] = useState("all")

  useEffect(() => {
    fetchNotifications()
  }, [])

  async function fetchNotifications() {
    setIsLoading(true)
    try {
      const res = await fetch("/api/admin/notifications")
      if (res.status === 503) {
        setSupabaseError(true)
        return
      }
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setNotifications(json.notifications || [])
      setStats(json.stats || { total: 0, unread: 0, today: 0 })
    } catch (error) {
      toast.error("Failed to fetch notifications")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSendNotification() {
    if (!notifTitle.trim() || !notifMessage.trim()) {
      toast.error("Please fill in all fields")
      return
    }

    setIsSending(true)
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAudience,
          type: notifType,
          title: notifTitle,
          message: notifMessage,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || "Failed to send notification")
      }

      toast.success(`Notification sent to ${json.sent} user(s)!`)
      setDialogOpen(false)
      setNotifTitle("")
      setNotifMessage("")
      setNotifType("system_announcement")
      fetchNotifications()
    } catch (error: any) {
      toast.error(error.message || "Failed to send notification")
    } finally {
      setIsSending(false)
    }
  }

  // Colors keyed by actual notification_type enum values
  const typeColors: Record<string, string> = {
    system_announcement: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    account_warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    security_alert: "bg-red-500/10 text-red-500 border-red-500/20",
    withdrawal_completed: "bg-green-500/10 text-green-500 border-green-500/20",
    withdrawal_failed: "bg-red-500/10 text-red-500 border-red-500/20",
    claim_success: "bg-green-500/10 text-green-500 border-green-500/20",
    referral_signup: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    referral_bonus: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  }

  const readRate = stats.total > 0 ? Math.round(((stats.total - stats.unread) / stats.total) * 100) : 0

  if (supabaseError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Database Not Connected</h2>
        <p className="text-muted-foreground">Please configure Supabase to manage notifications.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">Manage and send notifications to users</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Send className="mr-2 h-4 w-4" />
              Send Notification
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Send Notification</DialogTitle>
              <DialogDescription>Send a notification to all users or a specific group.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={notifType} onValueChange={setNotifType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system_announcement">Announcement</SelectItem>
                    <SelectItem value="account_warning">Account Warning</SelectItem>
                    <SelectItem value="security_alert">Security Alert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="audience">Send To</Label>
                <Select value={targetAudience} onValueChange={setTargetAudience}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="active">Active Users (24h)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Notification title..."
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  placeholder="Notification message..."
                  value={notifMessage}
                  onChange={(e) => setNotifMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendNotification} disabled={isSending}>
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unread</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.unread}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.today}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Read Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{readRate}%</div>
            <p className="text-xs text-muted-foreground">Engagement</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Notifications</CardTitle>
          <CardDescription>Latest notifications sent to users</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden sm:table-cell">Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((notification) => (
                    <TableRow key={notification.id}>
                      <TableCell>
                        <Badge
                          className={typeColors[notification.type] || "bg-blue-500/10 text-blue-500 border-blue-500/20"}
                          variant="outline"
                        >
                          {notification.type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium max-w-[150px] truncate">{notification.title}</TableCell>
                      <TableCell className="hidden sm:table-cell max-w-xs truncate text-muted-foreground">
                        {notification.message}
                      </TableCell>
                      <TableCell>
                        {notification.is_read ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-500">
                            Read
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500">
                            Unread
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No notifications yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Notifications sent to users will appear here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
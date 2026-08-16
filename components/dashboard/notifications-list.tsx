"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bell, CheckCheck, Coins, ArrowDownToLine, Users, AlertTriangle, Info, Trash2 } from "lucide-react"
import { formatRelativeTime } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface Notification {
  id: string
  type: string
  title: string
  message: string
  data?: Record<string, unknown>
  is_read: boolean
  created_at: string
}

interface NotificationsListProps {
  notifications: Notification[]
  userId: string
}

const notificationIcons: Record<string, typeof Bell> = {
  claim_success: Coins,
  withdrawal_completed: ArrowDownToLine,
  withdrawal_pending: ArrowDownToLine,
  withdrawal_failed: AlertTriangle,
  referral_bonus: Users,
  system: Info,
  security: AlertTriangle,
}

const notificationColors: Record<string, string> = {
  claim_success: "bg-green-500/10 text-green-500",
  withdrawal_completed: "bg-blue-500/10 text-blue-500",
  withdrawal_pending: "bg-yellow-500/10 text-yellow-500",
  withdrawal_failed: "bg-destructive/10 text-destructive",
  referral_bonus: "bg-purple-500/10 text-purple-500",
  system: "bg-muted text-muted-foreground",
  security: "bg-orange-500/10 text-orange-500",
}

export function NotificationsList({ notifications: initialNotifications, userId }: NotificationsListProps) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const markAsRead = async (id: string) => {
    const supabase = createClient()
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id)

    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
  }

  const markAllAsRead = async () => {
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("is_read", false)

    if (error) {
      toast.error("Failed to mark notifications as read")
    } else {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      toast.success("All notifications marked as read")
    }
    setLoading(false)
  }

  const deleteNotification = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("notifications").delete().eq("id", id)

    if (error) {
      toast.error("Failed to delete notification")
    } else {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }
  }

  const clearAll = async () => {
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase.from("notifications").delete().eq("user_id", userId)

    if (error) {
      toast.error("Failed to clear notifications")
    } else {
      setNotifications([])
      toast.success("All notifications cleared")
      router.refresh()
    }
    setLoading(false)
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-muted p-4">
          <Bell className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">No notifications</h3>
        <p className="text-sm text-muted-foreground">You&apos;re all caught up!</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {unreadCount > 0 && <Badge variant="secondary">{unreadCount} unread</Badge>}
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead} disabled={loading}>
              <CheckCheck className="mr-1 h-4 w-4" />
              Mark all read
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={clearAll}
            disabled={loading}
            className="text-destructive bg-transparent"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Clear all
          </Button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-2">
        {notifications.map((notification) => {
          const Icon = notificationIcons[notification.type] || Bell
          const colorClass = notificationColors[notification.type] || notificationColors.system

          return (
            <div
              key={notification.id}
              className={cn(
                "group flex items-start gap-4 rounded-lg border p-4 transition-colors",
                !notification.is_read && "bg-primary/5 border-primary/20",
                "hover:bg-muted/50",
              )}
              onClick={() => !notification.is_read && markAsRead(notification.id)}
            >
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", colorClass)}>
                <Icon className="h-5 w-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{notification.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                  </div>
                  {!notification.is_read && <div className="h-2 w-2 shrink-0 rounded-full bg-primary mt-2" />}
                </div>
                <p className="text-xs text-muted-foreground mt-2">{formatRelativeTime(notification.created_at)}</p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteNotification(notification.id)
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

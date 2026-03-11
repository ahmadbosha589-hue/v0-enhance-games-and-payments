"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bell, CheckCheck, Coins, ArrowDownToLine, Users, AlertTriangle } from "lucide-react"
import { useNotifications, type Notification } from "@/lib/hooks/use-notifications"
import { formatRelativeTime } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface NotificationsDropdownProps {
  userId: string
}

const notificationIcons: Record<string, typeof Bell> = {
  claim_success: Coins,
  withdrawal_completed: ArrowDownToLine,
  withdrawal_failed: AlertTriangle,
  referral_bonus: Users,
  system: Bell,
}

export function NotificationsDropdown({ userId }: NotificationsDropdownProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(userId)
  const [open, setOpen] = useState(false)

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between border-b p-3">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto gap-1 p-1 text-xs text-muted-foreground"
              onClick={() => markAllAsRead()}
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = notificationIcons[notification.type] || Bell
                return (
                  <button
                    key={notification.id}
                    className={cn(
                      "flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50",
                      !notification.is_read && "bg-primary/5",
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        notification.type.includes("success") || notification.type.includes("bonus")
                          ? "bg-green-500/10 text-green-500"
                          : notification.type.includes("failed")
                            ? "bg-destructive/10 text-destructive"
                            : "bg-primary/10 text-primary",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">{notification.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
                      <p className="text-xs text-muted-foreground">{formatRelativeTime(notification.created_at)}</p>
                    </div>
                    {!notification.is_read && <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

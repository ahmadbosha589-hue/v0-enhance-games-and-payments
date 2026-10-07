"use client"

import { useEffect, useState, useCallback } from "react"
import type { Profile } from "@/lib/types/database"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { UserMenu } from "@/components/auth/user-menu"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSelector } from "@/components/language-selector"
import { useLanguage } from "@/lib/i18n/language-context"
import { useRealtimeProfile } from "@/lib/hooks/use-realtime-profile"
import { Bell, AlertTriangle, ShieldAlert, Coins, Flame } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { formatRelativeTime, formatSatoshisDisplay } from "@/lib/utils/format"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface DashboardHeaderProps {
  profile: Profile
}

interface Notification {
  id: string
  title: string
  message: string
  type: string
  is_read: boolean
  created_at: string
  action_url: string | null
}

export function DashboardHeader({ profile: initialProfile }: DashboardHeaderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const { t } = useLanguage()
  
  // Use realtime profile for live balance updates - falls back to server-provided profile
  const { profile: realtimeProfile } = useRealtimeProfile(initialProfile.id)
  const profile = realtimeProfile || initialProfile

  // ... existing code for fetchNotifications, useEffect, markAsRead, markAllAsRead ...

  const fetchNotifications = useCallback(async () => {
    if (!profile.id) return

    try {
      const supabase = createClient()
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5)

      clearTimeout(timeoutId)

      if (!error && data) {
        setNotifications(data)
        setUnreadCount(data.filter((n: Notification) => !n.is_read).length)
      }
    } catch (error) {
      // Silently fail - notifications are non-critical
    } finally {
      setIsLoading(false)
    }
  }, [profile.id])

  useEffect(() => {
    fetchNotifications()

    if (!profile.id) return

    const supabase = createClient()
    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload: { new: unknown }) => {
          setNotifications((prev) => [payload.new as Notification, ...prev.slice(0, 4)])
          setUnreadCount((prev) => prev + 1)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile.id, fetchNotifications])

  const markAsRead = async (notificationId: string) => {
    try {
      const supabase = createClient()
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId)

      setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      // Silently fail
    }
  }

  const markAllAsRead = async () => {
    try {
      const supabase = createClient()
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", profile.id)
        .eq("is_read", false)

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (error) {
      // Silently fail
    }
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 sm:px-4 isolate">
      <SidebarTrigger className="-ml-1 h-9 w-9" />
      <Separator orientation="vertical" className="mr-2 h-4 hidden sm:block" />

      <div className="flex flex-1 items-center justify-between gap-2">
        {/* Desktop: Balance + Status */}
        <div className="hidden md:flex items-center gap-2 lg:gap-3">
          {/* Quick Balance Display */}
          <div className="flex items-center gap-1.5 lg:gap-2 rounded-lg bg-muted/50 px-2.5 lg:px-3 py-1.5">
            <Coins className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-primary" />
            <span className="text-xs lg:text-sm font-semibold tabular-nums">
              {formatSatoshisDisplay(profile.balance_satoshis || 0)}
            </span>
          </div>

          {/* Streak Badge */}
          {(profile.claim_streak || 0) > 0 && (
            <div className="flex items-center gap-1 lg:gap-1.5 rounded-lg bg-orange-500/10 px-2 lg:px-2.5 py-1.5 text-[10px] lg:text-xs font-medium text-orange-600 dark:text-orange-400">
              <Flame className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
              <span className="hidden lg:inline">
                {profile.claim_streak} {t("dashboard.header.dayStreak")}
              </span>
              <span className="lg:hidden">{profile.claim_streak}d</span>
            </div>
          )}

          {/* Status Badges */}
          {profile.is_flagged && (
            <div className="flex items-center gap-1 lg:gap-1.5 rounded-lg bg-amber-500/10 px-2 lg:px-2.5 py-1.5 text-[10px] lg:text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
              <span className="hidden lg:inline">{t("dashboard.header.underReview")}</span>
            </div>
          )}
          {profile.status === "banned" && (
            <div className="flex items-center gap-1 lg:gap-1.5 rounded-lg bg-destructive/10 px-2 lg:px-2.5 py-1.5 text-[10px] lg:text-xs font-medium text-destructive">
              <ShieldAlert className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
              <span className="hidden lg:inline">{t("dashboard.header.suspended")}</span>
            </div>
          )}
        </div>

        {/* Mobile: Compact Status - improved spacing */}
        <div className="flex md:hidden items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Coins className="h-4 w-4 text-primary" />
            <span className="tabular-nums">{formatSatoshisDisplay(profile.balance_satoshis || 0)}</span>
          </div>
          {(profile.is_flagged || profile.status === "banned") && (
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full",
                profile.status === "banned" ? "bg-destructive/10" : "bg-amber-500/10",
              )}
            >
              {profile.status === "banned" ? (
                <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              )}
            </div>
          )}
        </div>

        {/* Right Side Actions - improved touch targets */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {/* Notifications */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground animate-in zoom-in">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
                <span className="sr-only">{t("dashboard.header.notifications")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 sm:w-96" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuLabel className="flex items-center justify-between py-2">
                <span className="text-sm font-semibold">{t("dashboard.header.notifications")}</span>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto px-2 py-1 text-xs hover:bg-muted"
                    onClick={markAllAsRead}
                  >
                    {t("dashboard.header.markAllRead")}
                  </Button>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isLoading ? (
                <div className="py-8 text-center">
                  <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">{t("dashboard.header.loading")}</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mx-auto mb-3">
                    <Bell className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{t("dashboard.header.noNotifications")}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{t("dashboard.header.allCaughtUp")}</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {notifications.map((notification) => (
                    <DropdownMenuItem
                      key={notification.id}
                      className={cn(
                        "flex flex-col items-start gap-1 p-3 cursor-pointer focus:bg-muted",
                        !notification.is_read && "bg-primary/5",
                      )}
                      onClick={() => markAsRead(notification.id)}
                    >
                      {notification.action_url ? (
                        <Link href={notification.action_url} className="w-full">
                          <div className="flex items-start gap-2">
                            {!notification.is_read && (
                              <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{notification.title}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {notification.message}
                              </p>
                              <p className="text-[10px] text-muted-foreground/60 mt-1">
                                {formatRelativeTime(notification.created_at)}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ) : (
                        <div className="flex items-start gap-2 w-full">
                          {!notification.is_read && (
                            <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{notification.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{notification.message}</p>
                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                              {formatRelativeTime(notification.created_at)}
                            </p>
                          </div>
                        </div>
                      )}
                    </DropdownMenuItem>
                  ))}
                </div>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="justify-center text-sm font-medium text-primary">
                <Link href="/dashboard/notifications">{t("dashboard.header.viewAll")}</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <LanguageSelector />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

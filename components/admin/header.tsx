"use client"

import { useState, useEffect } from "react"
import { Bell, Search, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSelector } from "@/components/language-selector"
import { useLanguage } from "@/lib/i18n/language-context"
import { UserMenu } from "@/components/user-menu"
import type { Profile } from "@/lib/types/database"
import { AdminSidebar } from "./sidebar"
import { SupabaseStatusIndicator } from "@/components/admin/supabase-status-indicator"
import { createClient } from "@/lib/supabase/client"
import { formatRelativeTime } from "@/lib/utils"

interface AdminHeaderProps {
  profile: Profile
  email: string
}

interface AdminNotification {
  id: string
  type: string
  title: string
  message: string
  created_at: string
}

export function AdminHeader({ profile, email }: AdminHeaderProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [notificationCount, setNotificationCount] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const supabase = createClient()
        if (!supabase) {
          setNotifications([])
          setNotificationCount(0)
          return
        }

        // Fetch pending fraud flags as admin notifications
        const { data: fraudFlags, count: fraudCount } = await supabase
          .from("fraud_flags")
          .select("id, fraud_type, severity, created_at", { count: "exact" })
          .eq("status", "pending_review")
          .order("created_at", { ascending: false })
          .limit(5)

        // Fetch pending withdrawals as admin notifications
        const { data: withdrawals, count: withdrawalCount } = await supabase
          .from("withdrawals")
          .select("id, amount_satoshis, created_at", { count: "exact" })
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(5)

        const notifs: AdminNotification[] = []

        // Add fraud flags as notifications
        if (fraudFlags && fraudFlags.length > 0) {
          fraudFlags.forEach((flag: { id: string; fraud_type: string; severity: string; created_at: string }) => {
            notifs.push({
              id: `fraud-${flag.id}`,
              type: "fraud",
              title: "Fraud Alert",
              message: `${flag.fraud_type.replace(/_/g, " ")} detected (severity: ${flag.severity})`,
              created_at: flag.created_at,
            })
          })
        }

        // Add pending withdrawals as notifications
        if (withdrawals && withdrawals.length > 0) {
          withdrawals.forEach((w: { id: string; amount_satoshis: number; created_at: string }) => {
            notifs.push({
              id: `withdrawal-${w.id}`,
              type: "withdrawal",
              title: "Withdrawal Pending",
              message: `${w.amount_satoshis.toLocaleString()} sats awaiting review`,
              created_at: w.created_at,
            })
          })
        }

        // Sort by created_at and limit to 5
        notifs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setNotifications(notifs.slice(0, 5))
        setNotificationCount((fraudCount || 0) + (withdrawalCount || 0))
      } catch {
        setNotifications([])
        setNotificationCount(0)
      }
    }
    fetchNotifications()
  }, [])

  const user = {
    id: profile.id,
    email: email,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    role: profile.role,
  }

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 isolate">
      <div className="flex h-full items-center gap-4 px-4 sm:px-6">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden shrink-0">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 h-full overflow-hidden flex flex-col">
            <AdminSidebar profile={profile} isMobile onNavigate={() => setMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("admin.header.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/50"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Supabase connectivity status - compact in header */}
          <div className="hidden sm:block">
            <SupabaseStatusIndicator compact />
          </div>

          {/* Notifications - Only show real notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {notificationCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>{t("admin.header.notifications")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">{t("admin.header.noPending")}</div>
              ) : (
                notifications.map((notif) => (
                  <DropdownMenuItem key={notif.id} className="flex flex-col items-start gap-1">
                    <span className="font-medium">{notif.title}</span>
                    <span className="text-xs text-muted-foreground">{notif.message}</span>
                    <span className="text-xs text-muted-foreground/70">{formatRelativeTime(notif.created_at)}</span>
                  </DropdownMenuItem>
                ))
              )}
              {notifications.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="justify-center text-primary">
                    <a href="/admin/fraud">{t("admin.header.viewAllAlerts")}</a>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <LanguageSelector />
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  )
}

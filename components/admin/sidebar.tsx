"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { CryptoFaucetLogo } from "@/components/crypto-faucet-logo"
import type { Profile } from "@/lib/types/database"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/i18n/language-context"
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  CreditCard,
  FileText,
  Settings,
  Shield,
  Activity,
  BarChart3,
  Bell,
  ChevronLeft,
  Megaphone,
  Link2,
  Crown,
  Rocket,
  Key,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"

interface AdminSidebarProps {
  profile: Profile
  isMobile?: boolean
  onNavigate?: () => void
}

export function AdminSidebar({ profile, isMobile = false, onNavigate }: AdminSidebarProps) {
  const pathname = usePathname()
  const [fraudCount, setFraudCount] = useState(0)
  const { t } = useLanguage()

  useEffect(() => {
    async function fetchFraudCount() {
      try {
        const supabase = createClient()
        const { count } = await supabase
          .from("fraud_flags")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending_review")
        setFraudCount(count || 0)
      } catch {
        setFraudCount(0)
      }
    }
    fetchFraudCount()
  }, [])

  const navigation = [
    { nameKey: "admin.nav.dashboard", href: "/admin", icon: LayoutDashboard },
    { nameKey: "admin.nav.users", href: "/admin/users", icon: Users },
    {
      nameKey: "admin.nav.fraudReview",
      href: "/admin/fraud",
      icon: AlertTriangle,
      badge: fraudCount > 0 ? "alerts" : null,
      count: fraudCount,
    },
    { nameKey: "admin.nav.withdrawals", href: "/admin/withdrawals", icon: CreditCard },
    { nameKey: "admin.nav.transactions", href: "/admin/transactions", icon: FileText },
    { nameKey: "admin.nav.tournaments", href: "/admin/tournaments", icon: Crown },
    { nameKey: "admin.nav.boosters", href: "/admin/boosters", icon: Rocket },
    { nameKey: "admin.nav.analytics", href: "/admin/analytics", icon: BarChart3 },
    { nameKey: "admin.nav.auditLogs", href: "/admin/audit", icon: Activity },
    { nameKey: "admin.nav.notifications", href: "/admin/notifications", icon: Bell },
    { nameKey: "admin.nav.adManagement", href: "/admin/ads", icon: Megaphone },
    { nameKey: "admin.nav.shortlinks", href: "/admin/shortlinks", icon: Link2 },
  ]

  const settingsNav = [
    { nameKey: "admin.nav.systemSettings", href: "/admin/settings", icon: Settings },
    { nameKey: "admin.nav.envVars", href: "/admin/env-vars", icon: Key },
    { nameKey: "admin.nav.permissions", href: "/admin/permissions", icon: Shield },
  ]

  const handleLinkClick = () => {
    if (isMobile && onNavigate) {
      onNavigate()
    }
  }

  if (isMobile) {
    return (
      <div className="flex flex-col h-full max-h-screen bg-card overflow-hidden">
        {/* Logo - fixed at top */}
        <div className="flex h-16 items-center gap-2 border-b border-border px-6 shrink-0">
          <CryptoFaucetLogo className="h-8 w-8" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">Faucero</span>
            <Badge variant="outline" className="text-xs">
              {t("badge.admin")}
            </Badge>
          </div>
        </div>

        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-full">
            <nav className="px-4 py-4">
              <div className="space-y-1">
                {navigation.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))
                  const name = t(item.nameKey)
                  return (
                    <Link
                      key={item.nameKey}
                      href={item.href}
                      onClick={handleLinkClick}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                        isActive
                          ? "bg-primary/10 text-primary font-medium shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
                      <span>{name}</span>
                      {item.badge === "alerts" && item.count && item.count > 0 && (
                        <Badge variant="destructive" className="ml-auto text-xs px-1.5 py-0.5">
                          {item.count}
                        </Badge>
                      )}
                    </Link>
                  )
                })}
              </div>

              <Separator className="my-4" />

              <div className="space-y-1">
                <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {t("admin.nav.settings")}
                </p>
                {settingsNav.map((item) => {
                  const isActive = pathname === item.href
                  const name = t(item.nameKey)
                  return (
                    <Link
                      key={item.nameKey}
                      href={item.href}
                      onClick={handleLinkClick}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                        isActive
                          ? "bg-primary/10 text-primary font-medium shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
                      <span>{name}</span>
                    </Link>
                  )
                })}
              </div>
            </nav>
          </ScrollArea>
        </div>

        {/* Footer - fixed at bottom */}
        <div className="border-t border-border p-4 shrink-0">
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-bold shrink-0">
              {profile.username?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile.username || "Admin"}</p>
              <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full mt-2 justify-start" asChild>
            <Link href="/dashboard" onClick={handleLinkClick}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              {t("admin.nav.backToUserView")}
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  // Desktop sidebar (original)
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-72 border-r border-border bg-card hidden lg:flex lg:flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-border px-6 shrink-0">
        <CryptoFaucetLogo className="h-8 w-8" />
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">Faucero</span>
          <Badge variant="outline" className="text-xs">
            {t("badge.admin")}
          </Badge>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-hidden min-h-0">
        <ScrollArea className="h-full">
          <nav className="space-y-1 px-4 py-4">
            <div className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))
                const name = t(item.nameKey)
                return (
                  <Link
                    key={item.nameKey}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                      isActive
                        ? "bg-primary/10 text-primary font-medium shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                    {name}
                    {item.badge === "alerts" && item.count && item.count > 0 && (
                      <Badge variant="destructive" className="ml-auto text-xs px-1.5 py-0.5">
                        {item.count}
                      </Badge>
                    )}
                  </Link>
                )
              })}
            </div>

            <Separator className="my-4" />

            <div className="space-y-1">
              <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {t("admin.nav.settings")}
              </p>
              {settingsNav.map((item) => {
                const isActive = pathname === item.href
                const name = t(item.nameKey)
                return (
                  <Link
                    key={item.nameKey}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                      isActive
                        ? "bg-primary/10 text-primary font-medium shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                    {name}
                  </Link>
                )
              })}
            </div>
          </nav>
        </ScrollArea>
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4 shrink-0">
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-bold shrink-0">
            {profile.username?.[0]?.toUpperCase() || "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile.username || "Admin"}</p>
            <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full mt-2 justify-start" asChild>
          <Link href="/dashboard">
            <ChevronLeft className="mr-2 h-4 w-4" />
            {t("admin.nav.backToUserView")}
          </Link>
        </Button>
      </div>
    </aside>
  )
}

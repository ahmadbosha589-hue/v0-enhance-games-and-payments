"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { Profile } from "@/lib/types/database"
import { LogoFull, LogoIcon } from "@/components/icons/logo"
import { useLanguage } from "@/lib/i18n/language-context"
import { useRealtimeProfile } from "@/lib/hooks/use-realtime-profile"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  LayoutDashboard,
  Coins,
  Wallet,
  Users,
  History,
  Settings,
  HelpCircle,
  Trophy,
  Shield,
  Bell,
  Zap,
  Flame,
  ExternalLink,
  Gift,
  Play,
  Target,
  Sparkles,
  Gamepad2,
  Ticket,
  Link2,
  ArrowDownUp,
  Megaphone,
  HandCoins,
} from "lucide-react"
import { formatSatoshisDisplay } from "@/lib/utils/format"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface DashboardSidebarProps {
  profile: Profile
}

export function DashboardSidebar({ profile: initialProfile }: DashboardSidebarProps) {
  const pathname = usePathname()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  // Use realtime profile for live balance updates - falls back to server-provided profile
  const { profile: realtimeProfile } = useRealtimeProfile(initialProfile.id)
  const profile = realtimeProfile || initialProfile

  const isAdmin = profile.role && ["admin", "superadmin", "moderator"].includes(profile.role)
  const { t } = useLanguage()

  const mainNavItems = [
    { icon: LayoutDashboard, labelKey: "dashboard.nav.overview", href: "/dashboard", badge: null },
    { icon: Coins, labelKey: "dashboard.nav.claim", href: "/dashboard/claim", badge: "badge.hot" },
    { icon: Wallet, labelKey: "dashboard.nav.withdrawals", href: "/dashboard/withdrawals", badge: null },
    { icon: ArrowDownUp, labelKey: "dashboard.nav.swap", href: "/dashboard/swap", badge: "badge.new" },
    { icon: Megaphone, labelKey: "dashboard.nav.advertise", href: "/dashboard/advertise", badge: "badge.new" },
    { icon: Users, labelKey: "dashboard.nav.referrals", href: "/dashboard/referrals", badge: null },
    { icon: History, labelKey: "dashboard.nav.history", href: "/dashboard/history", badge: null },
    { icon: Trophy, labelKey: "dashboard.nav.leaderboard", href: "/dashboard/leaderboard", badge: null },
    { icon: Bell, labelKey: "dashboard.nav.notifications", href: "/dashboard/notifications", badge: null },
  ]

  const earnNavItems = [
    { icon: Sparkles, labelKey: "dashboard.nav.allEarnOptions", href: "/dashboard/earn", badge: "badge.new" },
    { icon: HandCoins, labelKey: "dashboard.nav.manualFaucet", href: "/dashboard/manual-faucet", badge: "badge.hot" },
    { icon: Gamepad2, labelKey: "dashboard.nav.games", href: "/dashboard/games", badge: "badge.hot" },
    { icon: Ticket, labelKey: "dashboard.nav.coupons", href: "/dashboard/coupons", badge: "badge.new" },
    { icon: Link2, labelKey: "dashboard.nav.shortlinks", href: "/dashboard/shortlinks", badge: null },
    { icon: Gift, labelKey: "dashboard.nav.offerwalls", href: "/dashboard/offerwalls", badge: null },
    { icon: Play, labelKey: "dashboard.nav.ptcAds", href: "/dashboard/ptc", badge: null },
    { icon: Target, labelKey: "dashboard.nav.achievements", href: "/dashboard/achievements", badge: null },
  ]

  const secondaryNavItems = [
    { icon: Settings, labelKey: "dashboard.nav.settings", href: "/dashboard/settings" },
    { icon: HelpCircle, labelKey: "dashboard.nav.helpCenter", href: "/help", external: false },
  ]

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-2 py-3 transition-opacity hover:opacity-80"
          aria-label="Dashboard Home"
        >
          {isCollapsed ? <LogoIcon size="sm" /> : <LogoFull size="sm" />}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="flex-1">
          {/* Balance Card - Hidden when collapsed */}
          {!isCollapsed && (
            <div className="p-3">
              <div className="rounded-xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{t("dashboard.nav.yourBalance")}</span>
                </div>
                <div className="text-2xl font-bold tracking-tight">
                  {formatSatoshisDisplay(profile.balance_satoshis || 0)}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Flame className="h-3 w-3 text-orange-500" />
                    {profile.claim_streak || 0} {t("dashboard.nav.days")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-violet-500" />
                    {profile.referral_count || 0} {t("dashboard.nav.refs")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Main Navigation */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider">
              {t("dashboard.nav.navigation")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNavItems.map((item) => {
                  const isActive = pathname === item.href
                  const label = t(item.labelKey)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={label}
                        className={cn(
                          "transition-all duration-200",
                          isActive && "bg-primary/10 text-primary font-medium border-l-2 border-primary",
                        )}
                      >
                        <Link href={item.href} className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                            <span>{label}</span>
                          </span>
                          {item.badge && !isCollapsed && (
                            <Badge
                              variant="secondary"
                              className="h-5 px-1.5 text-[10px] bg-orange-500/10 text-orange-500 border-orange-500/20"
                            >
                              {t(item.badge)}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider">
              {t("dashboard.nav.earnMore")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {earnNavItems.map((item) => {
                  const isActive = pathname === item.href
                  const label = t(item.labelKey)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={label}
                        className={cn(
                          "transition-all duration-200",
                          isActive && "bg-primary/10 text-primary font-medium border-l-2 border-primary",
                        )}
                      >
                        <Link href={item.href} className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                            <span>{label}</span>
                          </span>
                          {item.badge && !isCollapsed && (
                            <Badge
                              variant="secondary"
                              className={cn(
                                "h-5 px-1.5 text-[10px]",
                                item.badge === "badge.new"
                                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                                  : "bg-purple-500/10 text-purple-500 border-purple-500/20",
                              )}
                            >
                              {t(item.badge)}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Secondary Navigation */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider">
              {t("dashboard.nav.support")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {secondaryNavItems.map((item) => {
                  const isActive = pathname === item.href
                  const label = t(item.labelKey)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                        <Link href={item.href} className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <item.icon className="h-4 w-4" />
                            <span>{label}</span>
                          </span>
                          {item.external && !isCollapsed && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Admin Link */}
          {isAdmin && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs uppercase tracking-wider">
                {t("dashboard.nav.administration")}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip={t("dashboard.nav.adminPanel")}
                      className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                    >
                      <Link href="/admin" className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        <span>{t("dashboard.nav.adminPanel")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="border-t p-3">
        {!isCollapsed ? (
          <div className="flex flex-col gap-1 text-center">
            <span className="text-xs font-medium text-muted-foreground">Faucero</span>
            <span className="text-[10px] text-muted-foreground/60">v1.0.0</span>
          </div>
        ) : (
          <div className="flex justify-center">
            <Zap className="h-4 w-4 text-muted-foreground/50" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}

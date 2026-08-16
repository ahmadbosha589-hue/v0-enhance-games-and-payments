import { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  LayoutDashboard,
  Users,
  Coins,
  Crown,
  CreditCard,
  Settings,
  TrendingUp,
  Activity,
  ShieldAlert,
  ArrowRight
} from "lucide-react"

export const metadata: Metadata = {
  title: "Admin Dashboard | CryptoFaucet",
  description: "Admin dashboard overview",
}

const dashboardLinks = [
  {
    title: "Overview",
    description: "Platform statistics and quick actions",
    href: "/admin",
    icon: LayoutDashboard,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    title: "Users",
    description: "Manage user accounts and permissions",
    href: "/admin/users",
    icon: Users,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  {
    title: "Transactions",
    description: "View all platform transactions",
    href: "/admin/transactions",
    icon: Coins,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    title: "Tournaments",
    description: "Create and manage tournaments",
    href: "/admin/tournaments",
    icon: Crown,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  {
    title: "Withdrawals",
    description: "Process pending withdrawals",
    href: "/admin/withdrawals",
    icon: CreditCard,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    title: "Analytics",
    description: "Platform analytics and reports",
    href: "/admin/analytics",
    icon: TrendingUp,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
  {
    title: "Fraud Detection",
    description: "Monitor suspicious activity",
    href: "/admin/fraud",
    icon: ShieldAlert,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
  {
    title: "Settings",
    description: "Platform configuration",
    href: "/admin/settings",
    icon: Settings,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
  },
]

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">
            Quick access to all admin sections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
            <Activity className="h-3 w-3" />
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            System Online
          </Badge>
        </div>
      </div>

      {/* Quick Links Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboardLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="hover:shadow-md transition-all hover:border-primary/30 h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${link.bgColor}`}>
                    <link.icon className={`h-5 w-5 ${link.color}`} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-base mb-1">{link.title}</CardTitle>
                <CardDescription className="text-xs">
                  {link.description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <Link href="/admin/users?filter=pending">
              <Users className="h-4 w-4 mr-2" />
              Review Pending Users
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/withdrawals?status=pending">
              <CreditCard className="h-4 w-4 mr-2" />
              Process Withdrawals
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/fraud">
              <ShieldAlert className="h-4 w-4 mr-2" />
              Check Fraud Alerts
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/tournaments">
              <Crown className="h-4 w-4 mr-2" />
              Manage Tournaments
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Navigation Note */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-sm">Looking for detailed statistics?</p>
              <p className="text-xs text-muted-foreground">
                Visit the main admin overview for full platform statistics
              </p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link href="/admin">
              View Overview
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

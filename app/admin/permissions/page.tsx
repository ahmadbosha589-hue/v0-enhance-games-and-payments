import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Shield, Users, Settings, CreditCard, AlertTriangle, FileText, BarChart3 } from "lucide-react"

export const dynamic = "force-dynamic"

const rolePermissions = {
  superadmin: {
    description: "Full system access with all permissions",
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    permissions: [
      "Manage all users",
      "View and modify system settings",
      "Process withdrawals",
      "Review fraud cases",
      "View all transactions",
      "Access analytics",
      "Manage ad settings",
      "View audit logs",
      "Manage roles and permissions",
    ],
  },
  admin: {
    description: "Administrative access with most permissions",
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    permissions: [
      "Manage users (except superadmin)",
      "View system settings",
      "Process withdrawals",
      "Review fraud cases",
      "View all transactions",
      "Access analytics",
      "Manage ad settings",
      "View audit logs",
    ],
  },
  moderator: {
    description: "Limited administrative access for moderation",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    permissions: [
      "View user profiles",
      "Review fraud cases",
      "Flag suspicious activity",
      "View transactions (limited)",
    ],
  },
  user: {
    description: "Standard user with basic access",
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    permissions: [
      "Claim from faucet",
      "Request withdrawals",
      "View own transactions",
      "Manage own profile",
      "Access referral system",
    ],
  },
}

export default async function PermissionsPage() {
  const supabase = await createClient()

  // Get user counts by role when the database is configured.
  const { data: roleCounts } = supabase
    ? await supabase.from("profiles").select("role")
    : { data: null }

  const counts = {
    superadmin: roleCounts?.filter((u) => u.role === "superadmin").length || 0,
    admin: roleCounts?.filter((u) => u.role === "admin").length || 0,
    moderator: roleCounts?.filter((u) => u.role === "moderator").length || 0,
    user: roleCounts?.filter((u) => u.role === "user").length || 0,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Permissions</h1>
        <p className="text-muted-foreground">Manage role-based access control for the platform</p>
      </div>

      {/* Role Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(rolePermissions).map(([role, config]) => (
          <Card key={role}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Badge className={config.color} variant="outline">
                  {role}
                </Badge>
                <span className="text-2xl font-bold">{counts[role as keyof typeof counts]}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{config.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Permissions Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Permissions Matrix
          </CardTitle>
          <CardDescription>Overview of what each role can access</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                <TableHead className="text-center">Superadmin</TableHead>
                <TableHead className="text-center">Admin</TableHead>
                <TableHead className="text-center">Moderator</TableHead>
                <TableHead className="text-center">User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Manage Users
                  </div>
                </TableCell>
                <TableCell className="text-center text-green-500">Full</TableCell>
                <TableCell className="text-center text-yellow-500">Limited</TableCell>
                <TableCell className="text-center text-blue-500">View Only</TableCell>
                <TableCell className="text-center text-muted-foreground">-</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    System Settings
                  </div>
                </TableCell>
                <TableCell className="text-center text-green-500">Full</TableCell>
                <TableCell className="text-center text-blue-500">View Only</TableCell>
                <TableCell className="text-center text-muted-foreground">-</TableCell>
                <TableCell className="text-center text-muted-foreground">-</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    Process Withdrawals
                  </div>
                </TableCell>
                <TableCell className="text-center text-green-500">Full</TableCell>
                <TableCell className="text-center text-green-500">Full</TableCell>
                <TableCell className="text-center text-muted-foreground">-</TableCell>
                <TableCell className="text-center text-muted-foreground">-</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    Fraud Review
                  </div>
                </TableCell>
                <TableCell className="text-center text-green-500">Full</TableCell>
                <TableCell className="text-center text-green-500">Full</TableCell>
                <TableCell className="text-center text-yellow-500">Limited</TableCell>
                <TableCell className="text-center text-muted-foreground">-</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    View Transactions
                  </div>
                </TableCell>
                <TableCell className="text-center text-green-500">All</TableCell>
                <TableCell className="text-center text-green-500">All</TableCell>
                <TableCell className="text-center text-yellow-500">Limited</TableCell>
                <TableCell className="text-center text-blue-500">Own Only</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    Analytics
                  </div>
                </TableCell>
                <TableCell className="text-center text-green-500">Full</TableCell>
                <TableCell className="text-center text-green-500">Full</TableCell>
                <TableCell className="text-center text-muted-foreground">-</TableCell>
                <TableCell className="text-center text-muted-foreground">-</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    Manage Roles
                  </div>
                </TableCell>
                <TableCell className="text-center text-green-500">Full</TableCell>
                <TableCell className="text-center text-muted-foreground">-</TableCell>
                <TableCell className="text-center text-muted-foreground">-</TableCell>
                <TableCell className="text-center text-muted-foreground">-</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Role Details */}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(rolePermissions).map(([role, config]) => (
          <Card key={role}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="capitalize">{role}</CardTitle>
                <Badge className={config.color} variant="outline">
                  {counts[role as keyof typeof counts]} users
                </Badge>
              </div>
              <CardDescription>{config.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {config.permissions.map((permission, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {permission}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

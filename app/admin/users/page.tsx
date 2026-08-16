import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UsersTable } from "@/components/admin/users-table"
import { UsersFilters } from "@/components/admin/users-filters"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Database, RefreshCw, Users } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

interface UsersPageProps {
  searchParams: Promise<{
    search?: string
    status?: string
    role?: string
    page?: string
  }>
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const params = await searchParams
  const supabase = createAdminClient()

  // Handle case where Supabase is not configured
  if (!supabase) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            Users
          </h1>
          <p className="text-muted-foreground">Manage platform users and their accounts</p>
        </div>

        <Card className="border-amber-500/30">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mx-auto w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
              <Database className="h-7 w-7 text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Database Not Configured</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              User management requires a Supabase connection. Please configure your environment variables.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/admin/users">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/env-vars">Check Configuration</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const page = Number(params.page) || 1
  const limit = 20
  const offset = (page - 1) * limit

  let users: any[] = []
  let count: number | null = 0
  let loadError = false

  try {
    let query = supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (params.search) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.search)
      if (isUUID) {
        query = query.eq("id", params.search)
      } else {
        query = query.or(
          `username.ilike.%${params.search}%,display_name.ilike.%${params.search}%,faucetpay_email.ilike.%${params.search}%`,
        )
      }
    }

    if (params.status === "banned") {
      query = query.eq("status", "banned")
    } else if (params.status === "flagged") {
      query = query.eq("is_flagged", true)
    } else if (params.status === "active") {
      query = query.eq("status", "active").eq("is_flagged", false)
    }

    if (params.role && params.role !== "all") {
      query = query.eq("role", params.role)
    }

    const { data, count: queryCount, error } = await query

    if (error) {
      console.error("[Admin Users] Query error:", error)
      loadError = true
    } else {
      users = data || []
      count = queryCount

      // Try to get auth emails
      if (users.length > 0) {
        try {
          const { data: authData } = await supabase.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          })

          if (authData?.users) {
            const emailMap = new Map<string, string>()
            authData.users.forEach((authUser) => {
              if (authUser.email) {
                emailMap.set(authUser.id, authUser.email)
              }
            })

            users = users.map((user) => ({
              ...user,
              auth_email: emailMap.get(user.id) || null,
            }))
          }
        } catch (e) {
          console.error("[Admin Users] Failed to fetch auth emails:", e)
        }
      }
    }
  } catch (err) {
    console.error("[Admin Users] Exception:", err)
    loadError = true
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            Users
          </h1>
          <p className="text-muted-foreground">Manage platform users and their accounts</p>
        </div>

        <Card className="border-amber-500/30">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mx-auto w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="h-7 w-7 text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Unable to Load Users</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Could not fetch user data. The database may be temporarily unavailable.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/admin/users">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin">Back to Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">Manage platform users and their accounts</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            {count || 0} total users - Page {page} of {Math.ceil((count || 0) / limit) || 1}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersFilters />
          <UsersTable users={users} />
        </CardContent>
      </Card>
    </div>
  )
}

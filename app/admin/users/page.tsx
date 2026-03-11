import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UsersTable } from "@/components/admin/users-table"
import { UsersFilters } from "@/components/admin/users-filters"

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

  const page = Number(params.page) || 1
  const limit = 20
  const offset = (page - 1) * limit

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

  const { data: users, count, error } = await query

  let usersWithEmail = users || []
  if (users && users.length > 0 && supabase) {
    try {
      // Get user IDs from profiles
      const userIds = users.map((u) => u.id)

      // Fetch auth users to get their emails
      const { data: authData } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000, // Get enough to cover our users
      })

      if (authData?.users) {
        // Create a map of user ID to email
        const emailMap = new Map<string, string>()
        authData.users.forEach((authUser) => {
          if (authUser.email) {
            emailMap.set(authUser.id, authUser.email)
          }
        })

        // Merge auth email into profile data
        usersWithEmail = users.map((user) => ({
          ...user,
          auth_email: emailMap.get(user.id) || null,
        }))
      }
    } catch (e) {
      console.error("Failed to fetch auth emails:", e)
    }
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
          <UsersTable users={usersWithEmail} />
        </CardContent>
      </Card>
    </div>
  )
}

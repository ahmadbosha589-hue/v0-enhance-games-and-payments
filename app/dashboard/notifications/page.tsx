import { getUser, safeQuery } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NotificationsList } from "@/components/dashboard/notifications-list"
import { Bell } from "lucide-react"

export const metadata = {
  title: "Notifications",
}

export default async function NotificationsPage() {
  const user = await getUser()

  if (!user) redirect("/auth/login?redirect=/dashboard/notifications")

  const notifications = await safeQuery(
    (supabase) =>
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    [],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground">Stay updated with your account activity</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Bell className="h-5 w-5" />
            All Notifications
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Your recent notifications and updates</CardDescription>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No notifications yet</p>
              <p className="text-sm">You&apos;ll see updates here when there&apos;s activity</p>
            </div>
          ) : (
            <NotificationsList notifications={notifications} userId={user.id} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

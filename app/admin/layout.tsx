import type React from "react"
import { requireAdmin } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/admin/sidebar"
import { AdminHeader } from "@/components/admin/header"
import { ServerTime } from "@/components/server-time"
import { SupabaseHealthProvider } from "@/components/admin/supabase-health-provider"
import { ConnectivityBanner } from "@/components/admin/connectivity-banner"
import { unstable_noStore as noStore } from "next/cache"

export const dynamic = "force-dynamic"
export const maxDuration = 10

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  noStore()

  // Only a positively verified admin profile may render the admin shell.
  // Timeouts, missing configuration, stale cookies, and auth errors all fail
  // closed instead of falling through to a fabricated admin profile.
  const admin = await requireAdmin(["admin", "superadmin", "moderator", "owner"])
  if (!admin) {
    redirect("/auth/login?redirect=/admin")
  }

  const { user, profile } = admin
  const email = user.email || ""

  return (
    <SupabaseHealthProvider>
      {/*
        NOTE: AdblockProvider is intentionally NOT mounted on the admin panel.
        Admins must always be able to access dashboards, fraud tools and
        moderation queues — even if they personally run an adblocker or use a
        privacy browser like Brave. The anti-adblock layer applies only to
        end-user routes (e.g. /dashboard).
      */}
      <div className="min-h-screen bg-background flex flex-col">
        <AdminSidebar profile={profile} />
        <div className="lg:pl-72 flex flex-col flex-1">
          <AdminHeader profile={profile} email={email} />
          <ConnectivityBanner />
          <main className="flex-1 p-3 sm:p-4 md:p-6 pb-16">{children}</main>
          <ServerTime />
        </div>
      </div>
    </SupabaseHealthProvider>
  )
}

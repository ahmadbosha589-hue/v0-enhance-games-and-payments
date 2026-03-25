import { Suspense } from "react"
import { getUser, getProfile } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Gift, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { OfferwallVPNGuard } from "@/components/dashboard/offerwall-vpn-guard"
import { OfferwallsContent } from "@/components/offerwalls/offerwalls-content"

export const metadata = {
  title: "Offerwalls | CryptoFaucet",
  description: "Complete offers and surveys to earn satoshis",
}

function OfferwallsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    </div>
  )
}

export default async function OfferwallsPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login?redirect=/dashboard/offerwalls")

  const profile = await getProfile(user.id)
  if (!profile) redirect("/auth/login?redirect=/dashboard/offerwalls")

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Gift className="h-6 w-6 sm:h-7 sm:w-7 text-purple-500" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Offerwalls</h1>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground">
          Complete surveys, download apps, and finish tasks to earn satoshis
        </p>
      </div>

      {/* VPN Guard wraps the main content */}
      <OfferwallVPNGuard>
        {/* Info Alert */}
        <Alert className="border-blue-500/30 bg-blue-500/10">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-xs sm:text-sm">
            <strong>How it works:</strong> Choose an offerwall, complete offers, and earn satoshis! Rewards are credited
            automatically after the advertiser confirms completion (usually 5-30 minutes).
          </AlertDescription>
        </Alert>

        {/* Main Content */}
        <Suspense fallback={<OfferwallsSkeleton />}>
          <OfferwallsContent userId={user.id} />
        </Suspense>
      </OfferwallVPNGuard>
    </div>
  )
}

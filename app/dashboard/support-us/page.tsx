import { Suspense } from "react"
import { getUser, getProfile } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Heart, Info, Megaphone, ShieldCheck, WalletCards } from "lucide-react"
import { SupportUsContent } from "@/components/support-us/support-us-content"

export const metadata = {
  title: "Support Us | Faucero",
  description: "Support Faucero by viewing available non-Google partner advertising inventory.",
}

function SupportUsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32" />
      <Skeleton className="h-64" />
    </div>
  )
}

export default async function SupportUsPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login?redirect=/dashboard/support-us")

  const profile = await getProfile(user.id)
  if (!profile) redirect("/auth/login?redirect=/dashboard/support-us")

  return (
    <div className="space-y-6 p-4 sm:space-y-8 sm:p-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Heart className="h-6 w-6 text-red-500 sm:h-7 sm:w-7" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Support Us</h1>
          <Badge variant="secondary" className="bg-red-500/10 text-xs text-red-500">
            Partner ads
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground sm:text-base">
          Help keep Faucero running by viewing verified partner advertising inventory.
        </p>
      </header>

      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-xs sm:text-sm">
          This page shows non-Google partner inventory only. Marketing consent and a verified provider
          configuration are required before third-party ads appear. Rewarded watch payouts are currently
          unavailable, so no payout is promised for viewing ads.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Megaphone className="h-5 w-5 text-primary" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Partner surfaces</p>
                <p className="text-lg font-bold">11 partner ad networks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-500" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Google inventory</p>
                <p className="text-lg font-bold">Excluded here</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <WalletCards className="h-5 w-5 text-amber-500" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Rewarded payouts</p>
                <p className="text-lg font-bold">Unavailable</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Suspense fallback={<SupportUsSkeleton />}>
        <SupportUsContent userId={user.id} />
      </Suspense>

      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Why support Faucero?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Partner advertising helps fund hosting, development, security monitoring, and future faucet improvements.</p>
          <p>Only provider tags and campaigns verified by the operator should be enabled. Empty or unverified slots are hidden rather than presented as live ads.</p>
          <p>For cookie choices, use the site&apos;s Cookie Preferences page.</p>
        </CardContent>
      </Card>
    </div>
  )
}

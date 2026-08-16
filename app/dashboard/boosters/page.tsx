import { Suspense } from "react"
import { getUser, getProfile } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Zap, Flame, Crown, Star, Rocket, TrendingUp, Shield, Info } from "lucide-react"
import { BoostersContent } from "@/components/boosters/boosters-content"
import { Alert, AlertDescription } from "@/components/ui/alert"

export const metadata = {
  title: "Boosters | CryptoFaucet",
  description: "Boost your earnings with premium packages",
}

function BoostersSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-96" />
        ))}
      </div>
    </div>
  )
}

export default async function BoostersPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login?redirect=/dashboard/boosters")

  const profile = await getProfile(user.id)
  if (!profile) redirect("/auth/login?redirect=/dashboard/boosters")

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Rocket className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Boosters</h1>
          <Badge variant="secondary" className="text-xs">Premium</Badge>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground">
          Supercharge your earnings with premium booster packages
        </p>
      </div>

      {/* Info Alert */}
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-xs sm:text-sm">
          <strong>How Boosters Work:</strong> Purchase a booster to multiply your earnings on every faucet claim and offerwall completion. 
          Bonuses are applied automatically for the duration of your active booster.
        </AlertDescription>
      </Alert>

      {/* Benefits Section */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-green-500/10 shrink-0">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Faucet Bonus</p>
                <p className="text-sm sm:text-lg font-bold text-green-500">Up to 500%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10 shrink-0">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Offerwall Bonus</p>
                <p className="text-sm sm:text-lg font-bold text-blue-500">Up to 50%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 shrink-0">
                <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Duration</p>
                <p className="text-sm sm:text-lg font-bold text-amber-500">Up to 30 Days</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/10 shrink-0">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Support</p>
                <p className="text-sm sm:text-lg font-bold text-cyan-500">Priority</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Suspense fallback={<BoostersSkeleton />}>
        <BoostersContent userId={user.id} />
      </Suspense>

      {/* FAQ Section */}
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-1">How do boosters work?</h4>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Once purchased, boosters automatically multiply your earnings. The faucet bonus applies to every claim on the claim page, 
              and the offerwall bonus applies to all completed offers and surveys.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-1">Can I stack boosters?</h4>
            <p className="text-xs sm:text-sm text-muted-foreground">
              No, only one booster can be active at a time. If you purchase a new booster while one is active, 
              the duration will be extended and you&apos;ll receive the new tier&apos;s bonuses.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-1">What payment methods are accepted?</h4>
            <p className="text-xs sm:text-sm text-muted-foreground">
              We accept FaucetPay, CCPayment (multiple cryptocurrencies), CWallet, and direct wallet connections.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-1">Is there a refund policy?</h4>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Due to the digital nature of boosters, all sales are final. However, if you experience any issues, 
              please contact our support team.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

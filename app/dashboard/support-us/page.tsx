import { Suspense } from "react"
import { getUser, getProfile } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Heart, Play, Gift, TrendingUp, Info, Coins, Clock, CheckCircle2 } from "lucide-react"
import { SupportUsContent } from "@/components/support-us/support-us-content"

export const metadata = {
  title: "Support Us | CryptoFaucet",
  description: "Watch ads to support the website and earn rewards",
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
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Heart className="h-6 w-6 sm:h-7 sm:w-7 text-red-500" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Support Us</h1>
          <Badge variant="secondary" className="text-xs bg-red-500/10 text-red-500">Earn Rewards</Badge>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground">
          Watch ads to support our platform and earn rewards at the same time
        </p>
      </div>

      {/* Info Alert */}
      <Alert className="border-red-500/30 bg-red-500/5">
        <Info className="h-4 w-4 text-red-500" />
        <AlertDescription className="text-xs sm:text-sm">
          <strong>How it works:</strong> Click the button below to watch ads. Each completed ad viewing session 
          earns you <strong>$0.0007</strong> (approximately 70 satoshis). You&apos;re directly supporting 
          the platform while earning rewards!
        </AlertDescription>
      </Alert>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-green-500/10 shrink-0">
                <Coins className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Reward Per View</p>
                <p className="text-sm sm:text-lg font-bold text-green-500">$0.0007</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10 shrink-0">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Ad Duration</p>
                <p className="text-sm sm:text-lg font-bold text-blue-500">60 seconds</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 shrink-0">
                <Play className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Ads Per Session</p>
                <p className="text-sm sm:text-lg font-bold text-amber-500">3 Ads</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-500/10 shrink-0">
                <Heart className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Daily Limit</p>
                <p className="text-sm sm:text-lg font-bold text-red-500">Unlimited</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Suspense fallback={<SupportUsSkeleton />}>
        <SupportUsContent userId={user.id} />
      </Suspense>

      {/* Benefits Section */}
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Why Support Us?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Keep the Faucet Running</p>
              <p className="text-xs text-muted-foreground">
                Your ad views directly fund the faucet rewards for all users.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Earn While Supporting</p>
              <p className="text-xs text-muted-foreground">
                Get rewarded for every ad you watch - it&apos;s a win-win!
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Help Us Grow</p>
              <p className="text-xs text-muted-foreground">
                More support means bigger prizes and better features for everyone.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Counts Toward Tournaments</p>
              <p className="text-xs text-muted-foreground">
                Your support earnings count toward the Top Earner tournament!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

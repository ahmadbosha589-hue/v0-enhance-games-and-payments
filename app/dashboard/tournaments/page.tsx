import { Suspense } from "react"
import { getUser } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Crown, Gamepad2, AlertCircle } from "lucide-react"
import { TournamentsContent } from "@/components/tournaments/tournaments-content"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Tournaments | CryptoFaucet",
  description: "Compete in daily, weekly, and monthly tournaments to win prize pools",
}

// Loading skeleton for tournaments
function TournamentsLoading() {
  return (
    <div className="space-y-6">
      {/* Stats skeleton */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {/* Cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-96" />
        ))}
      </div>
    </div>
  )
}

export default async function TournamentsPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login?redirect=/dashboard/tournaments")

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Crown className="h-6 w-6 sm:h-7 sm:w-7 text-yellow-500" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tournaments</h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            Compete for prize pools in daily, weekly, and monthly tournaments
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Badge variant="outline" className="flex items-center gap-1.5 py-1.5 px-3">
            <Gamepad2 className="h-3.5 w-3.5" />
            Auto-tracked
          </Badge>
          <Badge className="bg-green-500 hover:bg-green-600 flex items-center gap-1.5 py-1.5 px-3">
            Live
          </Badge>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-yellow-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-500/20 shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                Your activity is tracked automatically
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Every faucet claim, offerwall completion, and earning counts toward tournaments.
                No registration needed - just earn and compete!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tournaments Content */}
      <Suspense fallback={<TournamentsLoading />}>
        <TournamentsContent userId={user.id} />
      </Suspense>

      {/* Rules */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-primary" />
            Tournament Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            {[
              "All tournaments are free to enter - no registration or fees required",
              "Your activity is tracked in real-time across all tournament types",
              "Prizes are distributed automatically at the end of each period (midnight UTC)",
              "Top players split the prize pool based on their ranking position",
              "Cheating or manipulation results in immediate disqualification and account ban",
            ].map((rule, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary mt-0.5">{i + 1}.</span>
                {rule}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

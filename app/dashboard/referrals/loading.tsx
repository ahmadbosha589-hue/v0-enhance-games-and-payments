import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2, Users } from "lucide-react"

export default function ReferralsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-6 space-y-3">
        <div className="relative">
          <div className="absolute inset-0 bg-violet-500/20 rounded-full animate-ping" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 border border-violet-500/20">
            <Users className="h-6 w-6 text-violet-500" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            <h2 className="text-base font-semibold">Loading Referrals</h2>
          </div>
          <p className="text-xs text-muted-foreground">Fetching your referral stats...</p>
        </div>
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-8 w-8 rounded-lg mb-2" />
              <Skeleton className="h-3 w-20 mb-1" />
              <Skeleton className="h-6 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-24" />
        </CardContent>
      </Card>
    </div>
  )
}

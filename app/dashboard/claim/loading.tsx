import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2, Coins } from "lucide-react"

export default function ClaimLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <div className="relative">
          <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-ping" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
            <Coins className="h-8 w-8 text-amber-500" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            <h2 className="text-lg font-semibold">Loading Faucet</h2>
          </div>
          <p className="text-sm text-muted-foreground">Preparing your claim interface...</p>
        </div>
      </div>

      <Card className="border-2 border-primary/20">
        <CardHeader className="border-b">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12 space-y-6">
          <Skeleton className="h-32 w-32 sm:h-40 sm:w-40 rounded-full" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-12 w-40" />
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-10 w-10 rounded-lg mb-2" />
              <Skeleton className="h-3 w-20 mb-1" />
              <Skeleton className="h-5 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

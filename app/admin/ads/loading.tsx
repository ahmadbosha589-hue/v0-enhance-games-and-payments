import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2, Megaphone } from "lucide-react"

export default function AdsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-6 space-y-3">
        <div className="relative">
          <div className="absolute inset-0 bg-pink-500/20 rounded-full animate-ping" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-pink-500/10 border border-pink-500/20">
            <Megaphone className="h-6 w-6 text-pink-500" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-pink-500" />
            <h2 className="text-base font-semibold">Loading Ad Management</h2>
          </div>
          <p className="text-xs text-muted-foreground">Fetching ad configurations...</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

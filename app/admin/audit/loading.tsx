import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2, ScrollText } from "lucide-react"

export default function AuditLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <div className="relative">
          <div className="absolute inset-0 bg-violet-500/20 rounded-full animate-ping" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/10 border border-violet-500/20">
            <ScrollText className="h-8 w-8 text-violet-500" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            <h2 className="text-lg font-semibold">Loading Audit Logs</h2>
          </div>
          <p className="text-sm text-muted-foreground">Fetching system activity records...</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

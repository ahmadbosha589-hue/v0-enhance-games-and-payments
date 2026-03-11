import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2, AlertTriangle } from "lucide-react"

export default function FraudLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-6 space-y-3">
        <div className="relative">
          <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-ping" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            <h2 className="text-base font-semibold">Loading Fraud Detection</h2>
          </div>
          <p className="text-xs text-muted-foreground">Analyzing suspicious activities...</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-amber-500/20">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2, Settings } from "lucide-react"

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-6 space-y-3">
        <div className="relative">
          <div className="absolute inset-0 bg-slate-500/20 rounded-full animate-ping" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-500/10 border border-slate-500/20">
            <Settings className="h-6 w-6 text-slate-500" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            <h2 className="text-base font-semibold">Loading Settings</h2>
          </div>
          <p className="text-xs text-muted-foreground">Preparing your account settings...</p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

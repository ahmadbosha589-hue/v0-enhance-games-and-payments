import { Loader2, HelpCircle } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col items-center justify-center py-6 space-y-3">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
            <HelpCircle className="h-7 w-7 text-primary" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <h2 className="text-base font-semibold">Loading Help Center</h2>
          </div>
          <p className="text-xs text-muted-foreground">Preparing FAQ and support resources...</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-3/4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

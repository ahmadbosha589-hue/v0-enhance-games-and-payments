import { Loader2, Coins } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
            <Coins className="h-10 w-10 text-primary" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <h1 className="text-xl font-semibold">Faucero</h1>
          </div>
          <p className="text-sm text-muted-foreground">Loading your experience...</p>
        </div>
      </div>
    </div>
  )
}

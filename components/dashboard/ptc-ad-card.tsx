"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, Timer, Eye } from "lucide-react"

interface PTCAd {
  id: string
  title: string
  description?: string
  url: string
  duration_seconds: number
  reward_satoshis: number
  total_views: number
}

interface PTCAdCardProps {
  ad: PTCAd
}

export function PTCAdCard({ ad }: PTCAdCardProps) {
  const router = useRouter()

  const handleWatch = () => {
    // Redirect to the dedicated watch page with 12 ad slots
    router.push(`/dashboard/ptc/watch/${ad.id}`)
  }

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 hover:border-green-500/50 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base sm:text-lg line-clamp-1">{ad.title}</CardTitle>
          <Badge className="bg-green-500/10 text-green-500 border-green-500/30 flex-shrink-0">
            +{ad.reward_satoshis} sats
          </Badge>
        </div>
        <CardDescription className="text-xs sm:text-sm line-clamp-2">
          {ad.description || "Watch this advertisement to earn satoshis"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Timer className="h-3.5 w-3.5" />
            <span>{ad.duration_seconds}s</span>
          </div>
          <div className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            <span>{ad.total_views.toLocaleString()} views</span>
          </div>
        </div>
        <Button onClick={handleWatch} className="w-full gap-2">
          <Play className="h-4 w-4" />
          Watch Ad
        </Button>
      </CardContent>
    </Card>
  )
}

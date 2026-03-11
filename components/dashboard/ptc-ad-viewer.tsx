"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Play, ExternalLink, CheckCircle2, Loader2 } from "lucide-react"
import { createBrowserClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface PTCAd {
  id: string
  title: string
  url: string
  duration_seconds: number
  reward_satoshis: number
}

interface PTCAdViewerProps {
  ad: PTCAd
  userId: string
}

export function PTCAdViewer({ ad, userId }: PTCAdViewerProps) {
  const [status, setStatus] = useState<"idle" | "watching" | "ready" | "claiming" | "completed">("idle")
  const [progress, setProgress] = useState(0)
  const [timeLeft, setTimeLeft] = useState(ad.duration_seconds)

  const supabase = createBrowserClient()

  useEffect(() => {
    let interval: NodeJS.Timeout

    if (status === "watching" && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          const newTime = prev - 1
          setProgress(((ad.duration_seconds - newTime) / ad.duration_seconds) * 100)

          if (newTime <= 0) {
            setStatus("ready")
            return 0
          }
          return newTime
        })
      }, 1000)
    }

    return () => clearInterval(interval)
  }, [status, timeLeft, ad.duration_seconds])

  const handleStartWatching = useCallback(() => {
    // Open ad in new tab
    window.open(ad.url, "_blank", "noopener,noreferrer")
    setStatus("watching")
    setTimeLeft(ad.duration_seconds)
    setProgress(0)
  }, [ad.url, ad.duration_seconds])

  const handleClaimReward = useCallback(async () => {
    setStatus("claiming")

    try {
      // Create view record
      const { error } = await supabase.from("ptc_views").insert({
        user_id: userId,
        ad_id: ad.id,
        reward_satoshis: ad.reward_satoshis,
        view_duration_seconds: ad.duration_seconds,
        completed: true,
        completed_at: new Date().toISOString(),
      })

      if (error) throw error

      // Update user balance (via RPC in production)
      // For now, show success
      setStatus("completed")
      toast.success(`Earned ${ad.reward_satoshis} satoshis!`)

      // Refresh page after a delay
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (error) {
      console.error("Error claiming reward:", error)
      toast.error("Failed to claim reward. Please try again.")
      setStatus("ready")
    }
  }, [supabase, userId, ad])

  if (status === "completed") {
    return (
      <Button disabled className="w-full gap-2 bg-green-500/20 text-green-500">
        <CheckCircle2 className="h-4 w-4" />
        Reward Claimed!
      </Button>
    )
  }

  if (status === "claiming") {
    return (
      <Button disabled className="w-full gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Claiming...
      </Button>
    )
  }

  if (status === "ready") {
    return (
      <Button onClick={handleClaimReward} className="w-full gap-2 bg-green-500 hover:bg-green-600">
        <CheckCircle2 className="h-4 w-4" />
        Claim {ad.reward_satoshis} sats
      </Button>
    )
  }

  if (status === "watching") {
    return (
      <div className="space-y-2">
        <Progress value={progress} className="h-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Watching...</span>
          <span>{timeLeft}s remaining</span>
        </div>
      </div>
    )
  }

  return (
    <Button onClick={handleStartWatching} className="w-full gap-2">
      <Play className="h-4 w-4" />
      Watch Ad
      <ExternalLink className="h-3 w-3" />
    </Button>
  )
}

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Play, ExternalLink, CheckCircle2, Loader2, AlertTriangle, Pause } from "lucide-react"
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
  const [status, setStatus] = useState<"idle" | "watching" | "paused" | "ready" | "claiming" | "completed">("idle")
  const [progress, setProgress] = useState(0)
  const [timeLeft, setTimeLeft] = useState(ad.duration_seconds)
  const [isPaused, setIsPaused] = useState(false)
  const adWindowRef = useRef<Window | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Monitor ad window and pause timer when user leaves the ad tab
  useEffect(() => {
    if (status !== "watching" && status !== "paused") return

    const checkAdWindow = () => {
      // If ad window was closed or user is not focused on it, pause the timer
      if (adWindowRef.current?.closed) {
        // Ad window was closed - pause and warn
        if (!isPaused && status === "watching") {
          setIsPaused(true)
          setStatus("paused")
          toast.warning("Ad window closed! Click 'Resume' to continue watching.", { duration: 5000 })
        }
      }
    }

    // Handle visibility change (user switches tabs/windows)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && status === "watching") {
        // User returned to this page - check if ad window is still open
        if (adWindowRef.current?.closed) {
          setIsPaused(true)
          setStatus("paused")
          toast.warning("Return to the ad page to continue watching!", { duration: 5000 })
        }
      }
    }

    // Handle window blur (user clicks away from this window)
    const handleBlur = () => {
      // This is expected when user clicks on the ad window, don't pause
    }

    // Handle window focus (user returns to this window)
    const handleFocus = () => {
      if (status === "watching" && adWindowRef.current?.closed) {
        setIsPaused(true)
        setStatus("paused")
        toast.warning("Ad window was closed! Reopen the ad to continue.", { duration: 5000 })
      }
    }

    // Check ad window every second
    const windowCheckInterval = setInterval(checkAdWindow, 1000)

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("blur", handleBlur)
    window.addEventListener("focus", handleFocus)

    return () => {
      clearInterval(windowCheckInterval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("blur", handleBlur)
      window.removeEventListener("focus", handleFocus)
    }
  }, [status, isPaused])

  // Timer logic - only runs when actively watching (not paused)
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (status === "watching" && !isPaused && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          const newTime = prev - 1
          setProgress(((ad.duration_seconds - newTime) / ad.duration_seconds) * 100)

          if (newTime <= 0) {
            setStatus("ready")
            toast.success("Ad complete! Click 'Claim' to receive your reward.", { duration: 5000 })
            return 0
          }
          return newTime
        })
      }, 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [status, isPaused, timeLeft, ad.duration_seconds])

  const handleStartWatching = useCallback(() => {
    // Open ad in new tab/window
    adWindowRef.current = window.open(ad.url, "_blank", "noopener,noreferrer")
    setStatus("watching")
    setTimeLeft(ad.duration_seconds)
    setProgress(0)
    setIsPaused(false)
    toast.info("Keep the ad page open until the timer completes!", { duration: 4000 })
  }, [ad.url, ad.duration_seconds])

  const handleResumeWatching = useCallback(() => {
    // Reopen ad window
    adWindowRef.current = window.open(ad.url, "_blank", "noopener,noreferrer")
    setIsPaused(false)
    setStatus("watching")
    toast.info("Timer resumed! Keep the ad page open.", { duration: 3000 })
  }, [ad.url])

  const handleClaimReward = useCallback(async () => {
    setStatus("claiming")

    try {
      // Use the API endpoint to properly credit the reward
      const response = await fetch("/api/ptc/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          adId: ad.id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to claim reward")
      }

      setStatus("completed")
      toast.success(`Earned ${data.reward} satoshis! New balance: ${data.newBalance} sats`, { duration: 4000 })

      // Close ad window if still open
      if (adWindowRef.current && !adWindowRef.current.closed) {
        adWindowRef.current.close()
      }

      // Force hard refresh to update all balances
      setTimeout(() => {
        // Clear any cached data and force full page reload
        window.location.href = window.location.href.split("?")[0] + "?t=" + Date.now()
      }, 1500)
    } catch (error) {
      console.error("Error claiming reward:", error)
      toast.error(error instanceof Error ? error.message : "Failed to claim reward. Please try again.")
      setStatus("ready")
    }
  }, [ad.id])

  if (status === "completed") {
    return (
      <Button disabled className="w-full gap-2 bg-green-500/20 text-green-500 hover:bg-green-500/20">
        <CheckCircle2 className="h-4 w-4" />
        Reward Claimed!
      </Button>
    )
  }

  if (status === "claiming") {
    return (
      <Button disabled className="w-full gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Claiming reward...
      </Button>
    )
  }

  if (status === "ready") {
    return (
      <Button onClick={handleClaimReward} className="w-full gap-2 bg-green-500 hover:bg-green-600 text-white">
        <CheckCircle2 className="h-4 w-4" />
        Claim {ad.reward_satoshis} sats
      </Button>
    )
  }

  if (status === "paused") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs">Return to ad page to continue!</span>
        </div>
        <Progress value={progress} className="h-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
            <Pause className="h-3 w-3" />
            <span>Paused</span>
          </div>
          <span>{timeLeft}s remaining</span>
        </div>
        <Button onClick={handleResumeWatching} variant="outline" className="w-full gap-2 border-yellow-500/50 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10">
          <Play className="h-4 w-4" />
          Resume Watching
        </Button>
      </div>
    )
  }

  if (status === "watching") {
    return (
      <div className="space-y-2">
        <Progress value={progress} className="h-2 [&>div]:bg-green-500" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="text-green-500 font-medium">Watching...</span>
          <span>{timeLeft}s remaining</span>
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Keep the ad window open until the timer completes
        </p>
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

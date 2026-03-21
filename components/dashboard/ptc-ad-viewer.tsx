"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Play, ExternalLink, CheckCircle2, Loader2, AlertTriangle, Pause, ArrowLeft } from "lucide-react"
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
  const [showReturnWarning, setShowReturnWarning] = useState(false)
  const adWindowRef = useRef<Window | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isAdWindowFocusedRef = useRef(false)

  // Monitor ad window and pause timer when user returns to THIS page (not on ad page)
  useEffect(() => {
    if (status !== "watching" && status !== "paused") return

    const checkAdWindow = () => {
      // Check if ad window is closed
      if (adWindowRef.current?.closed) {
        if (!isPaused && status === "watching") {
          setIsPaused(true)
          setStatus("paused")
          setShowReturnWarning(true)
          toast.warning("Ad window closed! Reopen it to continue.", { duration: 5000 })
        }
      }
    }

    // Handle visibility change - PAUSE when user returns to THIS page
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // User returned to THIS page - they should be on the ad page instead
        // PAUSE the timer - they need to go back to ad page
        if (status === "watching" && !isPaused) {
          // Check if ad window is still open
          if (!adWindowRef.current?.closed) {
            // Ad window is still open but user came back here - pause and warn
            setIsPaused(true)
            setStatus("paused")
            setShowReturnWarning(true)
            toast.warning("Timer paused! Return to the ad page to continue.", { duration: 5000 })
          } else {
            // Ad window is closed
            setIsPaused(true)
            setStatus("paused")
            setShowReturnWarning(true)
            toast.warning("Ad window closed! Reopen it to continue.", { duration: 5000 })
          }
        }
      } else if (document.visibilityState === "hidden") {
        // User left this page (hopefully to ad page) - RESUME the timer
        if (status === "paused" && isPaused && !adWindowRef.current?.closed) {
          setIsPaused(false)
          setStatus("watching")
          setShowReturnWarning(false)
        }
      }
    }

    // Handle window focus - user came back to this window
    const handleFocus = () => {
      // User focused on this window - they should be on ad page
      if (status === "watching" && !isPaused) {
        if (!adWindowRef.current?.closed) {
          // Ad still open but user is here - pause
          setIsPaused(true)
          setStatus("paused")
          setShowReturnWarning(true)
          toast.warning("Timer paused! Return to the ad page to continue watching.", { duration: 5000 })
        } else {
          // Ad window closed
          setIsPaused(true)
          setStatus("paused")
          setShowReturnWarning(true)
          toast.warning("Ad window was closed! Reopen it to continue.", { duration: 5000 })
        }
      }
    }

    // Handle window blur - user left this window (good - going to ad page)
    const handleBlur = () => {
      // User left this window - if ad window is open, resume timer
      if (status === "paused" && isPaused && !adWindowRef.current?.closed) {
        setIsPaused(false)
        setStatus("watching")
        setShowReturnWarning(false)
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
            setShowReturnWarning(false)
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
    setShowReturnWarning(false)
    toast.info("Stay on the ad page! Timer only runs while viewing the ad.", { duration: 4000 })
  }, [ad.url, ad.duration_seconds])

  const handleResumeWatching = useCallback(() => {
    // Check if ad window still exists and just needs focus
    if (adWindowRef.current && !adWindowRef.current.closed) {
      // Try to focus existing window
      adWindowRef.current.focus()
    } else {
      // Reopen ad window
      adWindowRef.current = window.open(ad.url, "_blank", "noopener,noreferrer")
    }
    setIsPaused(false)
    setStatus("watching")
    setShowReturnWarning(false)
    toast.info("Timer resumed! Stay on the ad page.", { duration: 3000 })
  }, [ad.url])

  const handleClaimReward = useCallback(async () => {
    setStatus("claiming")

    // Set a timeout to prevent infinite hanging
    const claimTimeout = setTimeout(() => {
      toast.error("Claim is taking too long. Please refresh the page and try again.")
      setStatus("ready")
    }, 15000) // 15 second timeout

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

      clearTimeout(claimTimeout)

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

      // Clear session/local storage caches for PTC - clear ALL cache to ensure fresh data
      try {
        sessionStorage.removeItem("mf_ptc_count_v1")
        sessionStorage.removeItem("mf_cache_time_v1")
        sessionStorage.removeItem("mf_claims_data_v1")
        sessionStorage.removeItem("mf_profile_v1")
      } catch { }

      // Broadcast PTC completion so the Direct Faucet page auto-unlocks
      // without needing a manual "Refresh Status" click.
      try {
        const bc = new BroadcastChannel("ptc_completed")
        bc.postMessage({ type: "ptc_completed", timestamp: Date.now() })
        bc.close()
      } catch { /* BroadcastChannel not supported in this env */ }

      // Force HARD refresh - clear all caches and reload
      setTimeout(() => {
        // Use multiple techniques to ensure hardest refresh possible
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => caches.delete(name))
          })
        }
        // Clear the browser cache by forcing reload with cache bust
        const url = new URL(window.location.href)
        url.searchParams.set('_refresh', Date.now().toString())
        url.searchParams.set('_nocache', Math.random().toString(36).substring(7))
        window.location.replace(url.toString())
      }, 1000)
    } catch (error) {
      clearTimeout(claimTimeout)
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
      <div className="space-y-3">
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="text-yellow-700 dark:text-yellow-300 text-xs">
            <strong>Timer paused!</strong> You must stay on the ad page for the timer to run.
            Click the button below to return to the ad and continue.
          </AlertDescription>
        </Alert>
        <Progress value={progress} className="h-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
            <Pause className="h-3 w-3" />
            <span>Paused</span>
          </div>
          <span>{timeLeft}s remaining</span>
        </div>
        <Button onClick={handleResumeWatching} variant="outline" className="w-full gap-2 border-yellow-500/50 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10">
          <ArrowLeft className="h-4 w-4" />
          Return to Ad Page
        </Button>
      </div>
    )
  }

  if (status === "watching") {
    return (
      <div className="space-y-2">
        <Progress value={progress} className="h-2 [&>div]:bg-green-500" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="text-green-500 font-medium animate-pulse">Timer running...</span>
          <span className="font-bold">{timeLeft}s</span>
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Stay on the ad page! If you return here, the timer will pause.
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

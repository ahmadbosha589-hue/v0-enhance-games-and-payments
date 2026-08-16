"use client"

import { useState, useEffect, useCallback, useRef, use } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Link2,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Coins,
  Clock,
  ExternalLink,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { AdSlotMultiNetwork } from "@/components/ads/ad-slot-multi-network"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"
import { WatchAdBonusReward } from "@/components/ads/watch-ad-bonus-reward"
import { useLanguage } from "@/lib/i18n/language-context"

interface Shortlink {
  id: string
  title: string
  destination_url: string
  reward_satoshis: number
  view_time_seconds: number
}

export default function ShortlinkGoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useLanguage()

  const [shortlink, setShortlink] = useState<Shortlink | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [status, setStatus] = useState<"loading" | "countdown" | "ready" | "claiming" | "completed">("loading")
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const viewStartTimeRef = useRef<number | null>(null)

  // Fetch shortlink details
  useEffect(() => {
    async function fetchShortlink() {
      try {
        const res = await fetch(`/api/shortlinks/${id}`)
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Failed to load shortlink")
        }
        const data = await res.json()
        setShortlink(data.shortlink)
        setCountdown(data.shortlink.view_time_seconds)
        setStatus("countdown")
        viewStartTimeRef.current = Date.now()

        // Start countdown immediately
        startCountdown(data.shortlink.view_time_seconds)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load shortlink")
        setStatus("loading")
      } finally {
        setIsLoading(false)
      }
    }
    fetchShortlink()

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [id])

  const startCountdown = (seconds: number) => {
    setCountdown(seconds)

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        const newCount = prev - 1
        if (newCount <= 0) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
          }
          setStatus("ready")
          toast.success("Link ready! Click to continue.")
          return 0
        }
        return newCount
      })
    }, 1000)
  }

  const handleComplete = useCallback(async () => {
    if (!shortlink) return

    setStatus("claiming")

    try {
      // Calculate view duration
      const viewDuration = viewStartTimeRef.current
        ? Math.floor((Date.now() - viewStartTimeRef.current) / 1000)
        : shortlink.view_time_seconds

      // Generate fingerprint
      const fingerprint = btoa(
        [navigator.userAgent, navigator.language, screen.width, screen.height].join("|")
      ).slice(0, 32)

      const response = await fetch("/api/shortlinks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          shortlinkId: shortlink.id,
          viewDuration,
          fingerprint,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to complete shortlink")
      }

      setStatus("completed")
      toast.success(`Earned ${data.reward} satoshis!`)

      // Clear cache
      try {
        sessionStorage.removeItem("mf_ptc_count_v1")
        sessionStorage.removeItem("mf_cache_time_v1")
      } catch { }

      // Open destination URL after a short delay
      setTimeout(() => {
        window.open(shortlink.destination_url, "_blank", "noopener,noreferrer")
      }, 1500)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to complete")
      setStatus("ready")
    }
  }, [shortlink])

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <Card className="border-primary/20">
            <CardContent className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="mt-4 text-muted-foreground">Loading shortlink...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error || !shortlink) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error || "Shortlink not found"}</AlertDescription>
          </Alert>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/dashboard/shortlinks">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Shortlinks
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const progress = shortlink.view_time_seconds > 0
    ? ((shortlink.view_time_seconds - countdown) / shortlink.view_time_seconds) * 100
    : 100

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2">
              <Link href="/dashboard/shortlinks">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Shortlinks
              </Link>
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Link2 className="h-6 w-6 text-primary" />
              {shortlink.title}
            </h1>
          </div>
          <Badge variant="outline" className="gap-2 text-lg py-2 px-4">
            <Coins className="h-5 w-5 text-amber-500" />
            {shortlink.reward_satoshis} sats
          </Badge>
        </div>

        {/* Top Ad Row - 3 ads */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AdSlotMultiNetwork position="header" size="rectangle" className="mx-auto" />
          <AdSlotMultiNetwork position="header" size="rectangle" className="mx-auto" />
          <AdSlotMultiNetwork position="header" size="rectangle" className="mx-auto" />
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Sidebar Ads */}
          <div className="hidden lg:flex lg:col-span-2 flex-col gap-4">
            <AdSlotMultiNetwork position="sidebar" size="skyscraper" className="mx-auto" />
          </div>

          {/* Main Content Card */}
          <div className="lg:col-span-8">
            <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Sparkles className="h-6 w-6 text-amber-500" />
                  Shortlink Redirect
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                {/* Countdown Display */}
                {status === "countdown" && (
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-5xl font-bold text-primary">{countdown}</span>
                    </div>
                    <Progress value={progress} className="h-3 [&>div]:bg-primary" />
                    <p className="text-muted-foreground flex items-center justify-center gap-2">
                      <Clock className="h-4 w-4" />
                      Please wait while we verify your visit...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Do not close this page. The link will be available shortly.
                    </p>
                  </div>
                )}

                {status === "ready" && (
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
                      <ExternalLink className="h-12 w-12 text-green-500" />
                    </div>
                    <div>
                      <p className="text-lg font-medium">Link Ready!</p>
                      <p className="text-sm text-muted-foreground">
                        Click below to claim your reward and continue to the destination
                      </p>
                    </div>
                    <Button onClick={handleComplete} size="lg" className="gap-2 bg-green-500 hover:bg-green-600">
                      <CheckCircle2 className="h-5 w-5" />
                      Continue to Link
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {status === "claiming" && (
                  <div className="text-center space-y-4">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                    <p className="text-lg font-medium">Claiming your reward...</p>
                  </div>
                )}

                {status === "completed" && (
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle2 className="h-12 w-12 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-500">+{shortlink.reward_satoshis} sats</p>
                      <p className="text-muted-foreground">Reward claimed! Opening destination...</p>
                    </div>

                    {/* Watch Ad to Double Shortlink Reward */}
                    <div className="pt-4 pb-2 border-t border-dashed">
                      <WatchAdBonusReward
                        type="shortlink_double"
                        baseAmount={shortlink.reward_satoshis}
                        multiplier={2}
                        isVisible={true}
                        className="w-full sm:w-auto"
                      />
                    </div>

                    <Button asChild className="gap-2" variant="outline">
                      <Link href="/dashboard/shortlinks">
                        <ArrowLeft className="h-4 w-4" />
                        Visit More Shortlinks
                      </Link>
                    </Button>
                  </div>
                )}

                {/* Destination Preview */}
                <div className="mt-6 p-4 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground mb-1">Destination:</p>
                  <p className="text-sm font-mono truncate">{shortlink.destination_url}</p>
                </div>
              </CardContent>
            </Card>

            {/* Bottom content ads */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <AdSlotMultiNetwork position="content" size="rectangle" className="mx-auto" />
              <AdSlotMultiNetwork position="content" size="rectangle" className="mx-auto" />
            </div>
          </div>

          {/* Right Sidebar Ads */}
          <div className="hidden lg:flex lg:col-span-2 flex-col gap-4">
            <AdSlotMultiNetwork position="sidebar" size="skyscraper" className="mx-auto" />
          </div>
        </div>

        {/* Bottom Ad Row - 3 ads */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AdSlotMultiNetwork position="footer" size="rectangle" className="mx-auto" />
          <AdSlotMultiNetwork position="footer" size="rectangle" className="mx-auto" />
          <AdSlotMultiNetwork position="footer" size="rectangle" className="mx-auto" />
        </div>

        {/* Spacer to separate Google Ads from other networks per policy */}
        <div className="h-8" aria-hidden="true" />

        {/* Partner Ads - 3x 60s static ads (MUST be separate from other networks) */}
        <MultiNetworkAds position="footer" layout="inline" className="mt-4" />

        {/* Another spacer */}
        <div className="h-8" aria-hidden="true" />

        {/* Other 11 Ad Networks + c.cx.ua — the cx.ua slot now renders as
            a peer inside MultiNetworkAds, so impressions are uniform across
            all 12 partners on every page view. */}
        <MultiNetworkAds position="footer" layout="grid" showLabels={false} />

        {/* Full width leaderboard */}
        <AdSlotMultiNetwork position="footer" size="leaderboard" className="mx-auto mt-6" />
      </div>
    </div>
  )
}

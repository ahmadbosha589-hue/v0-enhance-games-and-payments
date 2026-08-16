"use client"

import { useState, useEffect, useCallback, use, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Play,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Coins,
  Clock,
  Sparkles,
  Eye,
  Timer,
  ExternalLink,
  X,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { AdSlotMultiNetwork } from "@/components/ads/ad-slot-multi-network"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"
import { WatchAdBonusReward } from "@/components/ads/watch-ad-bonus-reward"
import { useLanguage } from "@/lib/i18n/language-context"
import confetti from "canvas-confetti"
import { cn } from "@/lib/utils"

interface PTCAd {
  id: string
  title: string
  description: string
  url: string
  duration_seconds: number
  reward_satoshis: number
}

export default function PTCWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useLanguage()

  const [ad, setAd] = useState<PTCAd | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [status, setStatus] = useState<"loading" | "ready" | "watching" | "claiming" | "completed">("loading")
  const [progress, setProgress] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showAdModal, setShowAdModal] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Fetch ad details
  useEffect(() => {
    async function fetchAd() {
      try {
        const res = await fetch(`/api/ptc/${id}`)
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Failed to load ad")
        }
        const data = await res.json()
        setAd(data.ad)
        setTimeLeft(data.ad.duration_seconds)
        setStatus("ready")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load ad")
      } finally {
        setIsLoading(false)
      }
    }
    fetchAd()
  }, [id])

  // Timer logic
  useEffect(() => {
    if (status !== "watching" || timeLeft <= 0 || !ad) return

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 1
        setProgress(((ad.duration_seconds - newTime) / ad.duration_seconds) * 100)

        if (newTime <= 0) {
          setStatus("claiming")
          setShowAdModal(false)
          handleClaimReward()
          return 0
        }
        return newTime
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [status, timeLeft, ad])

  const handleStartWatching = useCallback(() => {
    if (!ad) return
    setShowAdModal(true)
    setStatus("watching")
    setTimeLeft(ad.duration_seconds)
    setProgress(0)
    toast.info("View the sponsored content while the timer counts down.")
  }, [ad])

  const handleClaimReward = useCallback(async () => {
    if (!ad) return

    try {
      const response = await fetch("/api/ptc/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ adId: ad.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to claim reward")
      }

      setStatus("completed")
      toast.success(`Earned ${data.reward} satoshis!`)

      // Celebration confetti
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        })
      } catch { /* ignore */ }

      // Broadcast PTC completion so manual faucet auto-unlocks
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("ptc_completed")
          bc.postMessage({ type: "ptc_completed", adId: ad.id, timestamp: Date.now() })
          bc.close()
        }
      } catch { }

      // Clear cache
      try {
        sessionStorage.removeItem("mf_ptc_count_v1")
        sessionStorage.removeItem("mf_cache_time_v1")
      } catch { }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to claim")
      setStatus("ready")
    }
  }, [ad])

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <Card className="border-primary/20">
            <CardContent className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="mt-4 text-muted-foreground">Loading ad...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error || !ad) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error || "Ad not found"}</AlertDescription>
          </Alert>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/dashboard/ptc">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to PTC Ads
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2">
              <Link href="/dashboard/ptc">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to PTC Ads
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">{ad.title}</h1>
            <p className="text-muted-foreground">{ad.description}</p>
          </div>
          <Badge variant="outline" className="gap-2 text-lg py-2 px-4">
            <Coins className="h-5 w-5 text-amber-500" />
            {ad.reward_satoshis} sats
          </Badge>
        </div>

        {/* Main Watch Card */}
        <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Sparkles className="h-6 w-6 text-amber-500" />
              Watch & Earn
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            {/* Status Display */}
            {status === "ready" && (
              <div className="text-center space-y-4">
                <div className="mx-auto w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
                  <Eye className="h-12 w-12 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-medium">Ready to View Ad</p>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <Timer className="h-4 w-4" />
                    {ad.duration_seconds} seconds viewing time
                  </p>
                </div>
                <Alert className="text-left max-w-md mx-auto">
                  <Sparkles className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>How it works:</strong> Click start to open the ad content.
                    View the sponsored page while the timer counts down to earn your reward!
                  </AlertDescription>
                </Alert>
                <Button onClick={handleStartWatching} size="lg" className="gap-2 bg-green-600 hover:bg-green-700">
                  <Play className="h-5 w-5" />
                  Start Watching
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            )}

            {status === "watching" && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 rounded-full mb-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-green-500 font-medium">Viewing ad...</span>
                    <span className="font-bold text-xl">{timeLeft}s</span>
                  </div>
                </div>
                <Progress value={progress} className="h-3 [&>div]:bg-green-500" />
                <p className="text-xs text-muted-foreground text-center">
                  Keep watching! Your reward will be claimed automatically when the timer ends.
                </p>
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
                  <p className="text-2xl font-bold text-green-500">+{ad.reward_satoshis} sats</p>
                  <p className="text-muted-foreground">Reward claimed successfully!</p>
                </div>

                {/* Watch Ad to Double PTC Reward */}
                <div className="pt-4 pb-2 border-t border-dashed">
                  <WatchAdBonusReward
                    type="faucet_double"
                    baseAmount={ad.reward_satoshis}
                    multiplier={2}
                    isVisible={true}
                    className="w-full sm:w-auto"
                  />
                </div>

                <Button asChild className="gap-2" variant="outline">
                  <Link href="/dashboard/ptc">
                    <ArrowLeft className="h-4 w-4" />
                    Watch More Ads
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">How PTC Ads Work:</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
              <li>Click &quot;Start Watching&quot; to open the sponsored content</li>
              <li>View the content while the timer counts down</li>
              <li>Your reward is automatically claimed when the timer ends</li>
              <li>Complete 3 PTC ads daily to unlock the Direct Faucet</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Ad Modal - Fullscreen overlay with iframe and ads */}
      {showAdModal && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
          <div className="min-h-screen">
            {/* Top Bar with Timer */}
            <div className="sticky top-0 z-10 bg-background border-b shadow-sm">
              <div className="max-w-7xl mx-auto px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="gap-2">
                      <Coins className="h-4 w-4 text-amber-500" />
                      {ad.reward_satoshis} sats
                    </Badge>
                    <span className="text-sm text-muted-foreground">{ad.title}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-full">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <Clock className="h-4 w-4 text-green-500" />
                      <span className="font-bold text-lg text-green-500">{timeLeft}s</span>
                    </div>
                    <Progress value={progress} className="w-32 h-2 [&>div]:bg-green-500" />
                  </div>
                </div>
              </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
              {/* 3 Partner Ads Row */}
              <Card className="border-dashed">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-red-500" />
                    Partner Ads (3)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MultiNetworkAds position="content" layout="inline" priority="high" className="!mt-0" />
                </CardContent>
              </Card>

              {/* 11 Network Ads */}
              <Card className="border-dashed">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Partner Network Ads (11)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MultiNetworkAds position="content" layout="grid" showLabels={false} priority="high" />
                </CardContent>
              </Card>

              {/* Sponsored Content Banner/Iframe — much larger viewing area
                  so users actually see the ad content while the timer runs. */}
              <Card className="border-2 border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    Sponsored Content - {ad.title}
                  </CardTitle>
                  <CardDescription className="text-xs flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    {ad.url}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative w-full h-[60vh] min-h-[420px] sm:min-h-[560px] bg-muted rounded-lg overflow-hidden border">
                    <iframe
                      ref={iframeRef}
                      src={ad.url}
                      className="w-full h-full"
                      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                      referrerPolicy="no-referrer"
                      title={ad.title}
                    />
                    {/* Overlay to prevent interaction with iframe */}
                    <div className="absolute inset-0 bg-transparent" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    View the content above while the timer counts down. Your reward will be claimed automatically.
                  </p>
                </CardContent>
              </Card>

              {/* Additional Ad Slots — 4 wide on desktop for higher impression
                  density without crowding mobile. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <AdSlotMultiNetwork position="content" size="rectangle" className="mx-auto" />
                <AdSlotMultiNetwork position="content" size="rectangle" className="mx-auto" />
                <AdSlotMultiNetwork position="content" size="rectangle" className="mx-auto" />
                <AdSlotMultiNetwork position="content" size="rectangle" className="mx-auto" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

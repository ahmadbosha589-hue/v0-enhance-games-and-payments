"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { 
  Clock, 
  ExternalLink, 
  CheckCircle, 
  Coins, 
  Shield, 
  Loader2,
  AlertCircle,
  Play
} from "lucide-react"
import { AdSlotMultiNetwork } from "@/components/ads/ad-slot-multi-network"

export default function ShortlinkViewPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [shortlink, setShortlink] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [viewStartTime, setViewStartTime] = useState<number | null>(null)

  // Fetch shortlink data
  useEffect(() => {
    async function fetchShortlink() {
      try {
        const res = await fetch(`/api/shortlinks/${id}`)
        if (!res.ok) {
          if (res.status === 404) {
            setError("Shortlink not found or has expired.")
          } else {
            setError("Failed to load shortlink.")
          }
          return
        }
        const data = await res.json()
        setShortlink(data.shortlink)
        setCountdown(data.shortlink.view_time_seconds)
        setViewStartTime(Date.now())
      } catch (e) {
        setError("Network error. Please try again.")
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchShortlink()
  }, [id])

  // Countdown timer
  useEffect(() => {
    if (countdown > 0 && viewStartTime) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0 && viewStartTime && !isCompleted) {
      setIsCompleted(true)
    }
  }, [countdown, viewStartTime, isCompleted])

  // Claim reward
  const handleClaim = useCallback(async () => {
    if (!isCompleted || isClaiming || !shortlink) return

    setIsClaiming(true)
    try {
      const fingerprint = btoa(
        [navigator.userAgent, navigator.language, screen.width, screen.height].join("|")
      ).slice(0, 32)

      const res = await fetch("/api/shortlinks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortlinkId: shortlink.id,
          viewStartTime,
          fingerprint,
        }),
      })

      if (res.ok) {
        // Redirect to destination after claiming
        window.location.href = shortlink.destination_url
      } else {
        const data = await res.json()
        setError(data.error || "Failed to claim reward.")
      }
    } catch (e) {
      setError("Network error. Please try again.")
    } finally {
      setIsClaiming(false)
    }
  }, [isCompleted, isClaiming, shortlink, viewStartTime])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading shortlink...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <Card className="w-full max-w-md mx-4 border-destructive/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-destructive font-medium text-center">{error}</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => router.push("/dashboard/shortlinks")}
            >
              Back to Shortlinks
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Top Ad Banner */}
      <div className="w-full bg-muted/50 border-b">
        <div className="max-w-7xl mx-auto">
          <AdSlotMultiNetwork position="header" size="leaderboard" />
        </div>
      </div>

      <div className="container max-w-6xl mx-auto py-6 px-4">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Ad Column */}
          <div className="hidden lg:flex flex-col gap-4">
            <AdSlotMultiNetwork position="sidebar" size="skyscraper" />
            <AdSlotMultiNetwork position="sidebar" size="rectangle" />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-1 space-y-4">
            {/* Header */}
            <Card className="border-primary/20">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center mb-2">
                  {isCompleted ? (
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  ) : (
                    <Clock className="h-8 w-8 text-cyan-500" />
                  )}
                </div>
                <CardTitle className="text-lg">{shortlink?.title || "Shortlink"}</CardTitle>
                <Badge className="mx-auto mt-2 bg-green-500/20 text-green-500 border-green-500/30">
                  <Coins className="h-3 w-3 mr-1" />
                  +{shortlink?.reward_satoshis || 0} sats
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Countdown / Complete Status */}
                {!isCompleted ? (
                  <div className="text-center space-y-3">
                    <div className="text-5xl font-bold font-mono text-primary">
                      {countdown}
                    </div>
                    <p className="text-sm text-muted-foreground">seconds remaining</p>
                    <Progress 
                      value={((shortlink?.view_time_seconds - countdown) / shortlink?.view_time_seconds) * 100} 
                      className="h-2"
                    />
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <Shield className="h-3 w-3" />
                      Please wait while viewing ads
                    </p>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                      <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                      <p className="font-medium text-green-600">View completed!</p>
                      <p className="text-sm text-muted-foreground">
                        Click below to claim your reward and continue
                      </p>
                    </div>
                    <Button 
                      onClick={handleClaim}
                      disabled={isClaiming}
                      className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
                      size="lg"
                    >
                      {isClaiming ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Claiming...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Claim {shortlink?.reward_satoshis} sats &amp; Continue
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Middle Ad */}
            <AdSlotMultiNetwork position="content" size="rectangle" />

            {/* Info Card */}
            <Card className="bg-muted/30">
              <CardContent className="py-4">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Shield className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-500" />
                  <div>
                    <p className="font-medium text-foreground mb-1">Secure Shortlink</p>
                    <p>This link is verified safe. Your satoshis will be credited instantly after the timer completes.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Ad Column */}
          <div className="hidden lg:flex flex-col gap-4">
            <AdSlotMultiNetwork position="sidebar" size="skyscraper" />
            <AdSlotMultiNetwork position="sidebar" size="rectangle" />
          </div>
        </div>

        {/* Mobile Ads */}
        <div className="lg:hidden mt-4 space-y-4">
          <AdSlotMultiNetwork position="content" size="banner" />
          <AdSlotMultiNetwork position="content" size="rectangle" />
        </div>
      </div>

      {/* Bottom Ad Banner */}
      <div className="w-full bg-muted/50 border-t mt-6">
        <div className="max-w-7xl mx-auto">
          <AdSlotMultiNetwork position="footer" size="leaderboard" />
        </div>
      </div>
    </div>
  )
}

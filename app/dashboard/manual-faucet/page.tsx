"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import {
  Coins,
  Lock,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
  HelpCircle,
  Link2,
  ExternalLink,
  Play,
  RefreshCw,
  Shield,
  Zap,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import Link from "next/link"
import useSWR from "swr"
import { CryptoIcon } from "@/components/crypto-icon"
import { AntiBotVerification, type VerificationMetadata } from "@/components/captcha/anti-bot-verification"
import { useDeviceFingerprintContext } from "@/components/security/device-fingerprint-provider"
import { usePersistentVPNCheck } from "@/hooks/use-persistent-vpn-check"
import { useAdblock } from "@/components/adblock/adblock-provider"
import confetti from "canvas-confetti"

// FaucetPay supported cryptocurrencies (excluding BTC which is on main claim page)
const FAUCETPAY_CRYPTOS = [
  { symbol: "LTC", name: "Litecoin", decimals: 8 },
  { symbol: "ETH", name: "Ethereum", decimals: 18 },
  { symbol: "DOGE", name: "Dogecoin", decimals: 8 },
  { symbol: "TRX", name: "Tron", decimals: 6 },
  { symbol: "FEY", name: "Feyorra", decimals: 8 },
  { symbol: "ZEC", name: "Zcash", decimals: 8 },
  { symbol: "BCH", name: "Bitcoin Cash", decimals: 8 },
  { symbol: "DASH", name: "Dash", decimals: 8 },
  { symbol: "DGB", name: "DigiByte", decimals: 8 },
  { symbol: "SOL", name: "Solana", decimals: 9 },
  { symbol: "BNB", name: "BNB", decimals: 18 },
  { symbol: "MATIC", name: "Polygon", decimals: 18 },
  { symbol: "USDT", name: "Tether", decimals: 6 },
]

const CLAIM_VALUE_USD = 0.0001 // $0.0001 per claim
const COOLDOWN_SECONDS = 7 // 7 seconds cooldown
const SHORTLINK_REQUIRED_AFTER = 100 // Shortlink required after 100 claims

interface CryptoPrice {
  symbol: string
  price: number
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function ManualFaucetPage() {
  const supabase = createClient()
  const { fingerprint: deviceFingerprint, deviceStatus } = useDeviceFingerprintContext()
  const {
    vpnDetected: vpnBlocked,
    isChecking: vpnChecking,
    lastResult: vpnResult,
    recheck: recheckVPN,
  } = usePersistentVPNCheck({
    intervalMs: 30000,
    checkOnVisibilityChange: true,
    checkOnNetworkChange: true,
  })

  // Adblock detection
  const { isBlocked: adblockDetected, isFlagged: adblockFlagged } = useAdblock()

  const [selectedCrypto, setSelectedCrypto] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isClaiming, setIsClaiming] = useState(false)
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({})
  const [claimCounts, setClaimCounts] = useState<Record<string, number>>({})
  const [totalClaims, setTotalClaims] = useState(0)
  const [isLocked, setIsLocked] = useState(true)
  const [ptcAdsCompleted, setPtcAdsCompleted] = useState(0)
  const [shortlinkRequired, setShortlinkRequired] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [showVerification, setShowVerification] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)

  // Fetch crypto prices
  const { data: pricesData } = useSWR<{ prices: Record<string, CryptoPrice> }>("/api/crypto/prices", fetcher, {
    refreshInterval: 60000,
  })

  // Calculate crypto amounts based on $0.0001 value
  const getCryptoAmount = useCallback(
    (symbol: string) => {
      const price = pricesData?.prices?.[symbol]?.price
      if (!price || price === 0) return "0.00000000"
      const amount = CLAIM_VALUE_USD / price
      return amount.toFixed(8)
    },
    [pricesData]
  )

  // Load user data and check access
  const loadUserData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      setUser(user)

      // Get profile
      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).single()

      if (profileData) {
        setProfile(profileData)
      }

      // Check PTC ads completed today
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const { count: ptcCount } = await supabase
        .from("ptc_views")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("completed", true)
        .gte("viewed_at", today.toISOString())

      setPtcAdsCompleted(ptcCount || 0)
      setIsLocked((ptcCount || 0) < 2)

      // Get manual faucet claims today
      const { data: claimsData } = await supabase
        .from("manual_faucet_claims")
        .select("crypto_symbol, claimed_at")
        .eq("user_id", user.id)
        .gte("claimed_at", today.toISOString())

      if (claimsData) {
        const counts: Record<string, number> = {}
        let total = 0
        claimsData.forEach((claim) => {
          counts[claim.crypto_symbol] = (counts[claim.crypto_symbol] || 0) + 1
          total++
        })
        setClaimCounts(counts)
        setTotalClaims(total)

        // Check if shortlink is required (after every 100 claims)
        if (total > 0 && total % SHORTLINK_REQUIRED_AFTER === 0) {
          // Check if user completed a shortlink after the last 100th claim
          const { data: shortlinkData } = await supabase
            .from("shortlink_views")
            .select("viewed_at")
            .eq("user_id", user.id)
            .gte("viewed_at", today.toISOString())
            .order("viewed_at", { ascending: false })
            .limit(1)

          const lastClaimTime = claimsData[claimsData.length - 1]?.claimed_at
          const lastShortlinkTime = shortlinkData?.[0]?.viewed_at

          if (!lastShortlinkTime || new Date(lastShortlinkTime) < new Date(lastClaimTime)) {
            setShortlinkRequired(true)
          }
        }
      }

      // Calculate cooldowns
      const newCooldowns: Record<string, number> = {}
      if (claimsData) {
        const now = Date.now()
        claimsData.forEach((claim) => {
          const claimTime = new Date(claim.claimed_at).getTime()
          const elapsed = (now - claimTime) / 1000
          const remaining = Math.max(0, COOLDOWN_SECONDS - elapsed)
          if (remaining > 0) {
            newCooldowns[claim.crypto_symbol] = Math.ceil(remaining)
          }
        })
      }
      setCooldowns(newCooldowns)
    } catch (error) {
      console.error("Error loading user data:", error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadUserData()
  }, [loadUserData])

  // Cooldown countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCooldowns((prev) => {
        const newCooldowns = { ...prev }
        let hasChanges = false
        Object.keys(newCooldowns).forEach((key) => {
          if (newCooldowns[key] > 0) {
            newCooldowns[key]--
            hasChanges = true
            if (newCooldowns[key] === 0) {
              delete newCooldowns[key]
            }
          }
        })
        return hasChanges ? newCooldowns : prev
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const handleVerificationComplete = (token: string, metadata?: VerificationMetadata) => {
    setCaptchaToken(token)
    setIsVerified(true)
    setShowVerification(false)
    toast.success("Verification complete!", { description: "You can now claim your reward" })
  }

  const handleVerificationFail = (reason: string) => {
    setIsVerified(false)
    setCaptchaToken(null)
    toast.error("Verification failed", {
      description: reason || "Please try again",
      duration: 8000,
    })
  }

  const handleClaim = async (symbol: string) => {
    if (isClaiming || !user || !captchaToken) return
    if (cooldowns[symbol] && cooldowns[symbol] > 0) return
    if (shortlinkRequired) {
      toast.error("Shortlink Required", {
        description: "Please complete 1 shortlink to continue claiming",
      })
      return
    }
    if (vpnBlocked) {
      toast.error("VPN/Proxy detected", {
        description: "Please disable your VPN or proxy to claim rewards.",
      })
      return
    }
    if (deviceStatus === "blocked") {
      toast.error("This device has been blocked. Please contact support.")
      return
    }
    if (adblockDetected || adblockFlagged) {
      toast.error("AdBlock Detected", {
        description: "Please disable your ad blocker to claim rewards. Our site relies on ads to provide free crypto.",
      })
      return
    }

    setIsClaiming(true)
    setSelectedCrypto(symbol)

    try {
      const response = await fetch("/api/manual-faucet/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cryptoSymbol: symbol,
          captchaToken,
          fingerprint: deviceFingerprint ? { visitorId: deviceFingerprint } : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Claim failed")
      }

      // Success
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ["#00D4FF", "#10B981", "#F59E0B"],
      })

      toast.success(`Claimed ${data.amount} ${symbol}!`, {
        description: `Sent to your FaucetPay account`,
      })

      // Update cooldown
      setCooldowns((prev) => ({ ...prev, [symbol]: COOLDOWN_SECONDS }))

      // Update claim counts
      setClaimCounts((prev) => ({
        ...prev,
        [symbol]: (prev[symbol] || 0) + 1,
      }))

      const newTotal = totalClaims + 1
      setTotalClaims(newTotal)

      // Check if shortlink is now required
      if (newTotal > 0 && newTotal % SHORTLINK_REQUIRED_AFTER === 0) {
        setShortlinkRequired(true)
      }

      // Reset verification for next claim
      setIsVerified(false)
      setCaptchaToken(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to claim")
    } finally {
      setIsClaiming(false)
      setSelectedCrypto(null)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 mb-4">
              <Coins className="h-8 w-8 text-amber-500" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">Manual Crypto Faucet</h1>
            <p className="text-muted-foreground">
              Claim small amounts of crypto every 7 seconds - sent directly to FaucetPay
            </p>
          </div>
          <Button variant="outline" asChild className="gap-2">
            <Link href="/contact">
              <HelpCircle className="h-4 w-4" />
              Need help? Click here
            </Link>
          </Button>
        </div>

        {/* VPN Warning */}
        {vpnBlocked && (
          <Alert variant="destructive">
            <Shield className="h-4 w-4" />
            <AlertTitle>VPN/Proxy Detected</AlertTitle>
            <AlertDescription>
              Please disable your VPN, proxy, or Tor connection to claim rewards.
              <Button variant="outline" size="sm" onClick={() => recheckVPN()} disabled={vpnChecking} className="mt-2 ml-2">
                <RefreshCw className={`h-3 w-3 mr-1 ${vpnChecking ? "animate-spin" : ""}`} />
                Re-check
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* AdBlock Warning */}
        {(adblockDetected || adblockFlagged) && (
          <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <AlertTitle className="text-red-500">AdBlock Detected</AlertTitle>
            <AlertDescription>
              <p className="mb-2">
                Please disable your ad blocker to claim rewards. Our site relies on ads to provide free cryptocurrency.
              </p>
              <p className="text-sm text-muted-foreground">
                After disabling your ad blocker, please refresh the page to continue.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Locked State - Need 2 PTC Ads */}
        {isLocked && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center text-center gap-4">
                <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Lock className="h-10 w-10 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Access Locked</h2>
                  <p className="text-muted-foreground mt-1">
                    Complete <span className="font-bold text-amber-500">2 PTC Ads</span> to unlock the Manual Faucet
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={(ptcAdsCompleted / 2) * 100} className="w-48 h-2" />
                  <span className="text-sm font-medium">{ptcAdsCompleted}/2</span>
                </div>
                <Button asChild className="gap-2 bg-amber-500 hover:bg-amber-600">
                  <Link href="/dashboard/ptc">
                    <Play className="h-4 w-4" />
                    Watch PTC Ads
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Shortlink Required Warning */}
        {!isLocked && shortlinkRequired && (
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <AlertTitle className="text-red-500">Shortlink Required!</AlertTitle>
            <AlertDescription>
              <p className="mb-3">
                After every{" "}
                <span className="font-bold text-red-500 bg-yellow-300/80 px-1 rounded">
                  {SHORTLINK_REQUIRED_AFTER} faucet
                </span>{" "}
                claims,{" "}
                <span className="font-bold text-red-500 bg-yellow-300/80 px-1 rounded">1 Shortlink</span> must be
                completed to continue again!
              </p>
              <Button asChild variant="destructive" className="gap-2">
                <Link href="/dashboard/shortlinks">
                  <Link2 className="h-4 w-4" />
                  Complete Shortlink
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        {!isLocked && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30">
              <CardContent className="p-4 text-center">
                <Zap className="h-6 w-6 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Claims Today</p>
                <p className="text-2xl font-bold">{totalClaims}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30">
              <CardContent className="p-4 text-center">
                <Clock className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Cooldown</p>
                <p className="text-2xl font-bold">{COOLDOWN_SECONDS}s</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30">
              <CardContent className="p-4 text-center">
                <Coins className="h-6 w-6 text-amber-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Value/Claim</p>
                <p className="text-2xl font-bold">${CLAIM_VALUE_USD}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-500/10 to-violet-500/10 border-purple-500/30">
              <CardContent className="p-4 text-center">
                <Link2 className="h-6 w-6 text-purple-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Until Shortlink</p>
                <p className="text-2xl font-bold">{SHORTLINK_REQUIRED_AFTER - (totalClaims % SHORTLINK_REQUIRED_AFTER)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Verification Section */}
        {!isLocked && !shortlinkRequired && !isVerified && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Verify to Claim
              </CardTitle>
              <CardDescription>Complete the verification to start claiming crypto</CardDescription>
            </CardHeader>
            <CardContent>
              <AntiBotVerification
                turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
                onComplete={handleVerificationComplete}
                onFail={handleVerificationFail}
                difficulty={profile?.fraud_score > 50 ? "hard" : "normal"}
                requireProofOfWork={profile?.fraud_score > 40}
              />
            </CardContent>
          </Card>
        )}

        {/* Crypto Grid */}
        {!isLocked && !shortlinkRequired && isVerified && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Select Cryptocurrency</h2>
              <Badge variant="outline" className="gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                Verified
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {FAUCETPAY_CRYPTOS.map((crypto) => {
                const amount = getCryptoAmount(crypto.symbol)
                const cooldown = cooldowns[crypto.symbol] || 0
                const claimCount = claimCounts[crypto.symbol] || 0
                const isOnCooldown = cooldown > 0
                const isCurrentClaim = isClaiming && selectedCrypto === crypto.symbol

                return (
                  <Card
                    key={crypto.symbol}
                    className={`relative transition-all duration-300 hover:shadow-lg ${isOnCooldown
                        ? "opacity-60 border-muted"
                        : "border-primary/30 hover:border-primary/50 hover:scale-[1.02]"
                      }`}
                  >
                    <CardContent className="p-4 flex flex-col items-center text-center gap-3">
                      {/* Crypto Icon */}
                      <CryptoIcon symbol={crypto.symbol} size="xl" />

                      {/* Crypto Name */}
                      <div>
                        <h3 className="font-bold text-lg">{crypto.symbol}</h3>
                        <p className="text-xs text-muted-foreground">{crypto.name}</p>
                      </div>

                      {/* Amount */}
                      <div className="bg-muted/50 rounded-lg px-3 py-2 w-full">
                        <p className="text-xs text-muted-foreground">Reward</p>
                        <p className="font-mono font-bold text-sm">
                          {amount} {crypto.symbol}
                        </p>
                      </div>

                      {/* Claim Count */}
                      <p className="text-xs text-muted-foreground">Claims today: {claimCount}</p>

                      {/* Claim Button */}
                      <Button
                        className="w-full gap-2"
                        disabled={isOnCooldown || isClaiming || vpnBlocked}
                        onClick={() => handleClaim(crypto.symbol)}
                      >
                        {isCurrentClaim ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Claiming...
                          </>
                        ) : isOnCooldown ? (
                          <>
                            <Clock className="h-4 w-4" />
                            {cooldown}s
                          </>
                        ) : (
                          <>
                            <Coins className="h-4 w-4" />
                            Claim
                          </>
                        )}
                      </Button>
                    </CardContent>

                    {/* Cooldown Overlay */}
                    {isOnCooldown && (
                      <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] rounded-lg flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-3xl font-bold">{cooldown}s</div>
                          <p className="text-xs text-muted-foreground">Cooldown</p>
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* Shortlink Warning Banner - Always visible at bottom when not required */}
        {!isLocked && !shortlinkRequired && (
          <Alert className="border-amber-500/30 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-600">Important Notice</AlertTitle>
            <AlertDescription className="text-amber-600/80">
              After every{" "}
              <span className="font-bold text-red-500 bg-yellow-300/80 px-1 rounded">
                {SHORTLINK_REQUIRED_AFTER} faucet
              </span>{" "}
              claims,{" "}
              <span className="font-bold text-red-500 bg-yellow-300/80 px-1 rounded">1 Shortlink</span> must be
              completed to continue again! You have{" "}
              <span className="font-bold">{SHORTLINK_REQUIRED_AFTER - (totalClaims % SHORTLINK_REQUIRED_AFTER)}</span>{" "}
              claims remaining.
            </AlertDescription>
          </Alert>
        )}

        {/* Need Help Button (Mobile Footer) */}
        <div className="fixed bottom-4 right-4 sm:hidden">
          <Button asChild size="lg" className="rounded-full shadow-lg gap-2">
            <Link href="/contact">
              <HelpCircle className="h-5 w-5" />
              Need Help?
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

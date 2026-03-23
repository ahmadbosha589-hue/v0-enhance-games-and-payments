"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Ticket, Gift, Clock, CheckCircle, XCircle, Sparkles, Coins, AlertCircle } from "lucide-react"
import { createClient, getAuthUser } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/i18n/language-context"

interface Coupon {
  id: string
  code: string
  reward_satoshis: number
  description: string | null
  expires_at: string | null
  max_uses: number | null
  current_uses: number
  is_active: boolean
}

interface CouponRedemption {
  id: string
  coupon_id: string
  redeemed_at: string
  reward_satoshis: number
  coupons: {
    code: string
    description: string | null
  }
}

export default function CouponsPage() {
  const { t } = useLanguage()
  const [couponCode, setCouponCode] = useState("")
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [recentRedemptions, setRecentRedemptions] = useState<CouponRedemption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  // Featured promo codes (hints)
  const promoHints = [
    { hint: "WELCOME****", description: "New user bonus - 50 sats" },
    { hint: "BONUS***", description: "Special bonus - 100 sats" },
    { hint: "FREE****", description: "Free satoshis for all" },
  ]

  useEffect(() => {
    loadRedemptions()
  }, [])

  async function loadRedemptions() {
    try {
      if (!supabase) {
        setIsLoading(false)
        return
      }

      // Add a timeout to prevent infinite hanging
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Auth timeout")), 8000)
      )

      let user
      try {
        user = await Promise.race([getAuthUser(), timeoutPromise])
      } catch {
        console.error("Auth check timed out or failed")
        setIsLoading(false)
        return
      }

      if (!user) {
        setIsLoading(false)
        return
      }

      const { data, error } = await supabase
        .from("coupon_redemptions")
        .select(`
          id,
          coupon_id,
          redeemed_at,
          reward_satoshis,
          coupons (
            code,
            description
          )
        `)
        .eq("user_id", user.id)
        .order("redeemed_at", { ascending: false })
        .limit(10)

      if (!error && data) {
        setRecentRedemptions(data as unknown as CouponRedemption[])
      }
    } catch (error) {
      console.error("Error loading redemptions:", error)
    } finally {
      setIsLoading(false)
    }
  }

  async function redeemCoupon() {
    if (!couponCode.trim()) {
      setMessage({ type: "error", text: "Please enter a coupon code" })
      return
    }

    setIsRedeeming(true)
    setMessage(null)

    try {
      const user = await getAuthUser()
      if (!user) {
        setMessage({ type: "error", text: "Please log in to redeem coupons" })
        return
      }

      // Find the coupon
      const { data: coupon, error: couponError } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", couponCode.toUpperCase().trim())
        .eq("is_active", true)
        .single()

      if (couponError || !coupon) {
        setMessage({ type: "error", text: "Invalid or expired coupon code" })
        return
      }

      // Check if expired
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        setMessage({ type: "error", text: "This coupon has expired" })
        return
      }

      // Check if max uses reached
      if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
        setMessage({ type: "error", text: "This coupon has reached its maximum redemptions" })
        return
      }

      // Check if user already redeemed
      const { data: existing } = await supabase
        .from("coupon_redemptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("coupon_id", coupon.id)
        .single()

      if (existing) {
        setMessage({ type: "error", text: "You have already redeemed this coupon" })
        return
      }

      // Redeem the coupon
      const { error: redemptionError } = await supabase
        .from("coupon_redemptions")
        .insert({
          user_id: user.id,
          coupon_id: coupon.id,
          reward_satoshis: coupon.reward_satoshis
        })

      if (redemptionError) {
        setMessage({ type: "error", text: "Failed to redeem coupon. Please try again." })
        return
      }

      // Update coupon uses
      await supabase
        .from("coupons")
        .update({ current_uses: coupon.current_uses + 1 })
        .eq("id", coupon.id)

      // Update user balance
      await supabase.rpc("add_game_reward", {
        p_user_id: user.id,
        p_amount: coupon.reward_satoshis
      })

      setMessage({
        type: "success",
        text: `Congratulations! You received ${coupon.reward_satoshis} satoshis!`
      })
      setCouponCode("")
      loadRedemptions()
    } catch (error) {
      console.error("Error redeeming coupon:", error)
      setMessage({ type: "error", text: "An error occurred. Please try again." })
    } finally {
      setIsRedeeming(false)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 mb-4">
            <Ticket className="h-8 w-8 text-amber-500" />
          </div>
          <h1 className="text-3xl font-bold text-white">Coupon Codes</h1>
          <p className="text-gray-400 max-w-md mx-auto">
            Redeem promo codes to earn free satoshis. Check our social media for new codes!
          </p>
        </div>

        {/* Redeem Card */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Gift className="h-5 w-5 text-amber-500" />
              Redeem Coupon
            </CardTitle>
            <CardDescription>
              Enter your coupon code below to claim your reward
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Input
                placeholder="Enter coupon code..."
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 uppercase"
                onKeyDown={(e) => e.key === "Enter" && redeemCoupon()}
              />
              <Button
                onClick={redeemCoupon}
                disabled={isRedeeming || !couponCode.trim()}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-6"
              >
                {isRedeeming ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Redeeming...
                  </span>
                ) : (
                  "Redeem"
                )}
              </Button>
            </div>

            {/* Message */}
            {message && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${message.type === "success"
                ? "bg-green-500/20 border border-green-500/30 text-green-400"
                : "bg-red-500/20 border border-red-500/30 text-red-400"
                }`}>
                {message.type === "success" ? (
                  <CheckCircle className="h-5 w-5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 flex-shrink-0" />
                )}
                <span>{message.text}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Promo Hints */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Active Promotions
            </CardTitle>
            <CardDescription>
              Hints for currently active coupon codes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {promoHints.map((promo, i) => (
                <div
                  key={i}
                  className="p-4 rounded-lg bg-gray-800/50 border border-gray-700 hover:border-purple-500/50 transition-colors"
                >
                  <div className="font-mono text-lg font-bold text-purple-400 mb-1">
                    {promo.hint}
                  </div>
                  <p className="text-sm text-gray-400">{promo.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-300">
                  Follow us on Twitter and Telegram for exclusive coupon codes and giveaways!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Redemptions */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Clock className="h-5 w-5 text-cyan-500" />
              Your Redemption History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
              </div>
            ) : recentRedemptions.length === 0 ? (
              <div className="text-center py-8">
                <Ticket className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No coupons redeemed yet</p>
                <p className="text-sm text-gray-500">Enter a coupon code above to get started!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentRedemptions.map((redemption) => (
                  <div
                    key={redemption.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <div className="font-mono font-bold text-white">
                          {redemption.coupons?.code || "Unknown"}
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(redemption.redeemed_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      <Coins className="h-3 w-3 mr-1" />
                      +{redemption.reward_satoshis} sats
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

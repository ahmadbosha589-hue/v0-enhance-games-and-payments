"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import {
  Zap, Flame, Crown, Star, CheckCircle2, Clock, Coins,
  ArrowRight, Sparkles, Gift, ShoppingCart, AlertCircle,
  CreditCard, Wallet, Timer, TrendingUp, Shield, Copy
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { sendErc20Payment } from "@/lib/wallet/client"
import type { WalletPaymentDetails } from "@/lib/wallet/evm-payment"

interface BoostersContentProps {
  userId: string
}

interface BoosterTier {
  id: string
  name: string
  slug: string
  description: string
  price_usd: number
  price_satoshis: number
  faucet_bonus_percentage: number
  offerwall_bonus_percentage: number
  duration_days: number
  badge_color: string
  badge_icon: string
  priority: number
  features: string[]
}

interface ActiveBooster {
  id: string
  tier: string
  slug: string
  faucetBonus: number
  offerwallBonus: number
  expiresAt: string
  hoursRemaining: number
  daysRemaining: number
  badgeColor: string
  badgeIcon: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const TIER_ICONS: Record<string, typeof Zap> = {
  zap: Zap,
  flame: Flame,
  crown: Crown,
  star: Star,
}

const TIER_GRADIENTS: Record<string, string> = {
  basic: "from-green-500 to-emerald-400",
  pro: "from-blue-500 to-cyan-400",
  elite: "from-purple-500 to-pink-400",
  legend: "from-amber-500 to-orange-400",
}

function ActiveBoosterCard({ booster }: { booster: ActiveBooster }) {
  const Icon = TIER_ICONS[booster.badgeIcon] || Zap
  const gradient = TIER_GRADIENTS[booster.slug] || "from-green-500 to-emerald-400"
  const progressPercent = booster.daysRemaining > 0
    ? Math.min(100, (booster.hoursRemaining / (booster.daysRemaining * 24 + booster.hoursRemaining % 24)) * 100)
    : (booster.hoursRemaining / 24) * 100

  return (
    <Card className={cn(
      "border-2 overflow-hidden relative",
      `border-[${booster.badgeColor}]/50`
    )}>
      <div className={cn("h-2 w-full bg-gradient-to-r", gradient)} />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: `${booster.badgeColor}20` }}
            >
              <Icon className="h-6 w-6" style={{ color: booster.badgeColor }} />
            </div>
            <div>
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                {booster.tier} Booster
                <Badge className="text-xs" style={{ backgroundColor: booster.badgeColor }}>
                  Active
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Your current active booster
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bonuses */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Faucet Bonus</span>
            </div>
            <p className="text-xl font-bold text-green-500">+{booster.faucetBonus}%</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Offerwall Bonus</span>
            </div>
            <p className="text-xl font-bold text-blue-500">+{booster.offerwallBonus}%</p>
          </div>
        </div>

        {/* Time remaining */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Timer className="h-4 w-4" />
              Time Remaining
            </div>
            <span className="font-semibold">
              {booster.daysRemaining > 0
                ? `${booster.daysRemaining}d ${booster.hoursRemaining % 24}h`
                : `${booster.hoursRemaining}h`}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">
            Expires: {new Date(booster.expiresAt).toLocaleDateString()} at {new Date(booster.expiresAt).toLocaleTimeString()}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function BoosterTierCard({
  tier,
  isPopular,
  activeBooster,
  onPurchase
}: {
  tier: BoosterTier
  isPopular?: boolean
  activeBooster: ActiveBooster | null
  onPurchase: (tier: BoosterTier) => void
}) {
  const Icon = TIER_ICONS[tier.badge_icon] || Zap
  const gradient = TIER_GRADIENTS[tier.slug] || "from-green-500 to-emerald-400"
  const isCurrentTier = activeBooster?.slug === tier.slug

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 flex flex-col",
      isPopular && "border-2 border-primary shadow-lg shadow-primary/10",
      isCurrentTier && "border-2 ring-2 ring-offset-2"
    )} style={isCurrentTier ? { borderColor: tier.badge_color, ["--tw-ring-color" as string]: tier.badge_color } : undefined}>
      {/* Header gradient */}
      <div className={cn("h-2 w-full bg-gradient-to-r", gradient)} />

      {/* Popular badge - better positioned */}
      {isPopular && (
        <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground text-[10px] sm:text-xs px-2 py-0.5 shadow-lg z-10">
          Most Popular
        </Badge>
      )}

      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 sm:p-3 rounded-xl"
            style={{ backgroundColor: `${tier.badge_color}20` }}
          >
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: tier.badge_color }} />
          </div>
          <div>
            <CardTitle className="text-base sm:text-lg">{tier.name}</CardTitle>
            <CardDescription className="text-xs">{tier.duration_days} days</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1">
        {/* Price */}
        <div className="text-center py-3 sm:py-4 rounded-xl bg-muted/50">
          <p className="text-3xl sm:text-4xl font-bold">${tier.price_usd}</p>
          {tier.price_satoshis > 0 && (
            <p className="text-xs sm:text-sm text-muted-foreground">
              ≈ {(tier.price_satoshis / 100_000_000).toFixed(8)} BTC
              <span className="block text-[10px] mt-0.5" title="Satoshi amount is calculated at the live BTC/USD rate at purchase time and may vary slightly.">
                Live-rate pricing
              </span>
            </p>
          )}
        </div>

        {/* Bonuses */}
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center p-2.5 sm:p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <p className="text-lg sm:text-xl font-bold text-green-500">+{tier.faucet_bonus_percentage}%</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Faucet</p>
          </div>
          <div className="text-center p-2.5 sm:p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-lg sm:text-xl font-bold text-blue-500">+{tier.offerwall_bonus_percentage}%</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Offerwalls</p>
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-2">
          {tier.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-xs sm:text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="pt-4 flex-shrink-0">
        <Button
          className="w-full gap-2"
          size="lg"
          style={!isCurrentTier ? { backgroundColor: tier.badge_color } : {}}
          variant={isCurrentTier ? "outline" : "default"}
          onClick={() => onPurchase(tier)}
        >
          {isCurrentTier ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Current Plan
            </>
          ) : (
            <>
              <ShoppingCart className="h-4 w-4" />
              Purchase
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}

function PurchaseDialog({
  tier,
  open,
  onOpenChange,
  onConfirm,
  userBalance,
  pendingPayment,
  onCancelPendingPayment,
  paymentMethods,
}: {
  tier: BoosterTier | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (paymentMethod: string) => void
  userBalance: number
  paymentMethods: Record<string, boolean>
  pendingPayment?: {
    orderId: string
    paymentMethod?: string
    paymentAddress?: string
    paymentUrl?: string
    amountUsd: number
    amountBtc?: string
    expiresAt: string
    instructions?: string[]
    walletPayment?: WalletPaymentDetails
    transactionHash?: string
  } | null
  onCancelPendingPayment?: () => void
}) {
  const [paymentMethod, setPaymentMethod] = useState("faucetpay")
  const [isProcessing, setIsProcessing] = useState(false)

  if (!tier) return null

  const Icon = TIER_ICONS[tier.badge_icon] || Zap
  const hasEnoughSatoshis = userBalance >= tier.price_satoshis
  const paymentMethodAvailable = paymentMethod === "faucetpay"
    ? hasEnoughSatoshis
    : paymentMethods[paymentMethod] === true

  const handleConfirm = async () => {
    setIsProcessing(true)
    await onConfirm(paymentMethod)
    setIsProcessing(false)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  // Show pending payment screen if we have a pending crypto payment
  if (pendingPayment) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500 animate-pulse" />
              Awaiting Payment
            </DialogTitle>
            <DialogDescription>
              Send the exact amount to complete your {tier.name} Booster purchase.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Amount to pay */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
              <p className="text-sm text-muted-foreground mb-1">Amount to send</p>
              <p className="text-2xl font-bold text-amber-500">${pendingPayment.amountUsd}</p>
              {pendingPayment.amountBtc && !pendingPayment.walletPayment && (
                <p className="text-sm text-muted-foreground">({pendingPayment.amountBtc} BTC)</p>
              )}
              {pendingPayment.walletPayment && (
                <p className="text-sm text-muted-foreground">
                  {pendingPayment.walletPayment.amountToken} {pendingPayment.walletPayment.tokenSymbol} on {pendingPayment.walletPayment.chainName}
                </p>
              )}
              {pendingPayment.transactionHash && (
                <p className="text-xs text-muted-foreground break-all mt-1">Transaction: {pendingPayment.transactionHash}</p>
              )}
            </div>

            {/* Hosted checkout URL */}
            {pendingPayment.paymentUrl && (
              <div className="space-y-2">
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700"
                  size="lg"
                  asChild
                >
                  <a href={pendingPayment.paymentUrl} target="_blank" rel="noopener noreferrer">
                    Open Payment Checkout
                  </a>
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Opens in a new tab - complete the payment there
                </p>
              </div>
            )}

            {/* Payment address (for direct wallet transfer) */}
            {pendingPayment.paymentAddress && (
              <div className="space-y-2">
                <Label>BTC Payment Address</Label>
                <div className="flex gap-2">
                  <Input
                    value={pendingPayment.paymentAddress}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(pendingPayment.paymentAddress!)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Order ID reference */}
            <div className="space-y-2">
              <Label>Order Reference</Label>
              <div className="flex gap-2">
                <Input
                  value={pendingPayment.orderId}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(pendingPayment.orderId)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Expiry warning */}
            <Alert className="bg-amber-500/10 border-amber-500/30">
              <Clock className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-xs">
                Payment expires at {new Date(pendingPayment.expiresAt).toLocaleTimeString()}.
                Your booster will be activated automatically after blockchain confirmation.
              </AlertDescription>
            </Alert>

            {/* Instructions */}
            {pendingPayment.instructions && pendingPayment.instructions.length > 0 ? (
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                {pendingPayment.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            ) : (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>1. Send exactly ${pendingPayment.amountUsd} in crypto</p>
                <p>2. Wait for blockchain confirmation (10-30 min)</p>
                <p>3. Your booster activates automatically</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onCancelPendingPayment?.()
                onOpenChange(false)
              }}
            >
              Close (I&apos;ve sent the payment)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" style={{ color: tier.badge_color }} />
            Purchase {tier.name} Booster
          </DialogTitle>
          <DialogDescription>
            Choose your payment method to activate this booster.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="p-4 rounded-xl bg-muted/50 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium">{tier.duration_days} days</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Faucet Bonus</span>
              <span className="font-medium text-green-500">+{tier.faucet_bonus_percentage}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Offerwall Bonus</span>
              <span className="font-medium text-blue-500">+{tier.offerwall_bonus_percentage}%</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>
                  ${tier.price_usd}
                  {tier.price_satoshis > 0 && (
                    <span className="block text-right text-xs font-normal text-muted-foreground">
                      ≈ {(tier.price_satoshis / 100_000_000).toFixed(8)} BTC at live rate
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="space-y-3">
            <Label>Payment Method</Label>
            <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="grid gap-2">
              <div className={cn(
                "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                hasEnoughSatoshis ? "hover:bg-muted/50" : "opacity-50 cursor-not-allowed",
                paymentMethod === "faucetpay" && hasEnoughSatoshis && "border-primary bg-primary/5"
              )}>
                <RadioGroupItem value="faucetpay" id="faucetpay" disabled={!hasEnoughSatoshis} />
                <Label htmlFor="faucetpay" className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      <span>Pay with Satoshis</span>
                    </div>
                    <span className={cn("text-xs", hasEnoughSatoshis ? "text-green-500" : "text-red-500")}>
                      Balance: {userBalance.toLocaleString()}
                    </span>
                  </div>
                  {!hasEnoughSatoshis && (
                    <p className="text-xs text-red-500 mt-1">
                      Insufficient balance (need {(tier.price_satoshis / 100_000_000).toFixed(8)} BTC ≈ {tier.price_satoshis.toLocaleString()} sats)
                    </p>
                  )}
                </Label>
              </div>
              <div className={cn(
                "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors",
                paymentMethod === "ccpayment" && "border-primary bg-primary/5"
              )}>
                <RadioGroupItem value="ccpayment" id="ccpayment" disabled={!paymentMethods.ccpayment} />
                <Label htmlFor="ccpayment" className={cn("flex-1", paymentMethods.ccpayment ? "cursor-pointer" : "cursor-not-allowed")}>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span>Pay with Crypto (CCPayment)</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {paymentMethods.ccpayment ? "BTC, ETH, USDT, and 50+ coins" : "Unavailable until CCPayment is configured"}
                  </p>
                </Label>
              </div>
              <div className={cn(
                "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors",
                paymentMethod === "cwallet" && "border-primary bg-primary/5"
              )}>
                <RadioGroupItem value="cwallet" id="cwallet" disabled={!paymentMethods.cwallet} />
                <Label htmlFor="cwallet" className={cn("flex-1", paymentMethods.cwallet ? "cursor-pointer" : "cursor-not-allowed")}>
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4" />
                    <span>CWallet via CCPayment</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {paymentMethods.cwallet ? "Open CCPayment checkout and pay from your Cwallet wallet" : "Unavailable until CCPayment is configured"}
                  </p>
                </Label>
              </div>
              <div className={cn(
                "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors",
                paymentMethod === "wallet_connect" && "border-primary bg-primary/5"
              )}>
                <RadioGroupItem value="wallet_connect" id="wallet_connect" disabled={!paymentMethods.wallet_connect} />
                <Label htmlFor="wallet_connect" className={cn("flex-1", paymentMethods.wallet_connect ? "cursor-pointer" : "cursor-not-allowed")}>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span>WalletConnect / EVM Wallet</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {paymentMethods.wallet_connect ? "ERC-20 payment with MetaMask or WalletConnect and server-side confirmation" : "Unavailable until the EVM chain, token, destination, RPC, and confirmations are configured"}
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Payment info for crypto methods */}
          {paymentMethod !== "faucetpay" && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Crypto payments require blockchain confirmation. Your booster will be activated within 10-30 minutes after payment.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing || !paymentMethodAvailable}
            style={{ backgroundColor: tier.badge_color }}
          >
            {isProcessing ? (
              <>Processing...</>
            ) : paymentMethod === "faucetpay" ? (
              <>
                <Coins className="h-4 w-4 mr-2" />
                Pay ${(tier.price_satoshis / 100_000_000).toFixed(8)} BTC
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4 mr-2" />
                Pay ${tier.price_usd}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BoostersContent({ userId }: BoostersContentProps) {
  const [selectedTier, setSelectedTier] = useState<BoosterTier | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingPayment, setPendingPayment] = useState<{
    orderId: string
    paymentMethod?: string
    paymentAddress?: string
    paymentUrl?: string
    amountUsd: number
    amountBtc?: string
    expiresAt: string
    instructions?: string[]
    walletPayment?: WalletPaymentDetails
    transactionHash?: string
  } | null>(null)

  const { data, isLoading, error, mutate } = useSWR(
    `/api/boosters`,
    fetcher,
    {
      refreshInterval: 60000,
      revalidateOnFocus: false,
    }
  )

  const { data: pendingOrder } = useSWR(
    pendingPayment ? `/api/boosters?orderId=${encodeURIComponent(pendingPayment.orderId)}` : null,
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: true },
  )

  useEffect(() => {
    if (pendingOrder?.orderStatus !== "completed") return
    toast.success(`${selectedTier?.name || "Booster"} payment confirmed`, {
      description: "Your booster is now active.",
    })
    setPendingPayment(null)
    setDialogOpen(false)
    setSelectedTier(null)
    mutate()
  }, [pendingOrder?.orderStatus, selectedTier?.name, mutate])

  useEffect(() => {
    const walletPayment = pendingPayment?.walletPayment
    const transactionHash = pendingPayment?.transactionHash
    if (!walletPayment || !transactionHash) return

    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const verify = async () => {
      try {
        const response = await fetch("/api/boosters/wallet/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: pendingPayment.orderId, transactionHash }),
        })
        const result = await response.json()
        if (stopped) return

        if (response.status === 202) {
          timer = setTimeout(verify, 10000)
          return
        }
        if (!response.ok) {
          toast.error("Wallet payment could not be verified", { description: result.error })
          return
        }
        mutate()
      } catch {
        if (!stopped) timer = setTimeout(verify, 10000)
      }
    }

    void verify()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [pendingPayment?.orderId, pendingPayment?.transactionHash, pendingPayment?.walletPayment, mutate])

  // Fetch user balance for satoshi payments
  const { data: profileData, mutate: mutateProfile } = useSWR(
    `/api/profile`,
    fetcher,
    { revalidateOnFocus: true }
  )

  const userBalance = profileData?.profile?.balance_satoshis || 0

  const handlePurchase = (tier: BoosterTier) => {
    setSelectedTier(tier)
    setDialogOpen(true)
    setPendingPayment(null) // Reset pending payment state
  }

  const handleConfirmPurchase = async (paymentMethod: string) => {
    if (!selectedTier) return

    try {
      const response = await fetch("/api/boosters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierId: selectedTier.id,
          paymentMethod,
        }),
      })

      const result = await response.json()

      if (result.success) {
        if (result.paymentCompleted) {
          // Satoshi payment - instant activation
          toast.success(`${selectedTier.name} Booster activated!`, {
            description: result.message
          })
          mutate()
          mutateProfile() // Refresh balance
          setDialogOpen(false)
          setSelectedTier(null)
        } else if (paymentMethod === "wallet_connect" && result.walletPayment) {
          try {
            const transactionHash = await sendErc20Payment(result.walletPayment as WalletPaymentDetails)
            setPendingPayment({
              orderId: result.orderId,
              paymentMethod: result.paymentMethod,
              amountUsd: result.amountUsd,
              expiresAt: result.expiresAt,
              instructions: result.instructions,
              walletPayment: result.walletPayment,
              transactionHash,
            })
            toast.info("Wallet transaction submitted", {
              description: "Waiting for blockchain confirmations before activating the booster.",
            })
          } catch (walletError) {
            toast.error("Wallet payment was not sent", {
              description: walletError instanceof Error ? walletError.message : "The wallet rejected the transaction.",
            })
          }
        } else {
          // Crypto payment - show payment instructions / hosted checkout / address
          setPendingPayment({
            orderId: result.orderId,
            paymentMethod: result.paymentMethod,
            paymentAddress: result.paymentAddress,
            paymentUrl: result.paymentUrl,
            amountUsd: result.amountUsd,
            amountBtc: result.amountBtc,
            expiresAt: result.expiresAt,
            instructions: result.instructions,
          })
          toast.info("Payment created", {
            description: result.message || "Complete the payment to activate your booster",
          })
        }
      } else {
        toast.error("Purchase failed", {
          description: result.message || result.error,
        })
      }
    } catch (err) {
      toast.error("Purchase failed", { description: "Please try again later" })
    }

    // Keep the dialog open for pending external payments so the user can
    // access the checkout URL/address and order reference. The webhook will
    // activate the booster after confirmed payment.
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[450px]" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load boosters. Please try again later.
        </AlertDescription>
      </Alert>
    )
  }

  const tiers: BoosterTier[] = data?.tiers || []
  const activeBooster: ActiveBooster | null = data?.activeBooster
  const paymentMethods: Record<string, boolean> = data?.paymentMethods || {
    faucetpay: true,
    ccpayment: false,
    cwallet: false,
    wallet_connect: false,
  }

  return (
    <div className="space-y-6">
      {/* Active Booster */}
      {activeBooster && (
        <div className="space-y-3">
          <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Your Active Booster
          </h2>
          <ActiveBoosterCard booster={activeBooster} />
        </div>
      )}

      {/* Available Tiers */}
      <div className="space-y-3">
        <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          {activeBooster ? "Upgrade or Extend" : "Choose Your Booster"}
        </h2>
        <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier, index) => (
            <BoosterTierCard
              key={tier.id}
              tier={tier}
              isPopular={index === 1} // Pro is popular
              activeBooster={activeBooster}
              onPurchase={handlePurchase}
            />
          ))}
        </div>
      </div>

      {/* Purchase Dialog */}
      <PurchaseDialog
        tier={selectedTier}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleConfirmPurchase}
        userBalance={userBalance}
        paymentMethods={paymentMethods}
        pendingPayment={pendingPayment}
        onCancelPendingPayment={() => setPendingPayment(null)}
      />
    </div>
  )
}

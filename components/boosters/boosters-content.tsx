"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import {
  Zap, Flame, Crown, Star, CheckCircle2, Clock, Coins,
  ArrowRight, Sparkles, Gift, ShoppingCart, AlertCircle,
  CreditCard, Wallet, Timer, TrendingUp, Shield
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

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
    )} style={isCurrentTier ? { borderColor: tier.badge_color, ringColor: tier.badge_color } : {}}>
      {/* Header gradient */}
      <div className={cn("h-2 w-full bg-gradient-to-r", gradient)} />
      
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -right-8 top-8 rotate-45 bg-primary px-8 py-1 text-xs font-bold text-primary-foreground shadow-md">
          Popular
        </div>
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
          <p className="text-xs sm:text-sm text-muted-foreground">
            or {tier.price_satoshis.toLocaleString()} sats
          </p>
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
  onConfirm
}: {
  tier: BoosterTier | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (paymentMethod: string) => void
}) {
  const [paymentMethod, setPaymentMethod] = useState("faucetpay")
  const [isProcessing, setIsProcessing] = useState(false)

  if (!tier) return null

  const Icon = TIER_ICONS[tier.badge_icon] || Zap

  const handleConfirm = async () => {
    setIsProcessing(true)
    await onConfirm(paymentMethod)
    setIsProcessing(false)
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
                <span>${tier.price_usd} / {tier.price_satoshis.toLocaleString()} sats</span>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="space-y-3">
            <Label>Payment Method</Label>
            <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="grid gap-2">
              <div className="flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="faucetpay" id="faucetpay" />
                <Label htmlFor="faucetpay" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    <span>FaucetPay</span>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="ccpayment" id="ccpayment" />
                <Label htmlFor="ccpayment" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span>CCPayment (Crypto)</span>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="cwallet" id="cwallet" />
                <Label htmlFor="cwallet" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4" />
                    <span>CWallet</span>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="wallet_connect" id="wallet_connect" />
                <Label htmlFor="wallet_connect" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span>Direct Wallet</span>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isProcessing}
            style={{ backgroundColor: tier.badge_color }}
          >
            {isProcessing ? (
              <>Processing...</>
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

  const { data, isLoading, error, mutate } = useSWR(
    `/api/boosters`,
    fetcher,
    { 
      refreshInterval: 60000,
      revalidateOnFocus: false,
    }
  )

  const handlePurchase = (tier: BoosterTier) => {
    setSelectedTier(tier)
    setDialogOpen(true)
  }

  const handleConfirmPurchase = async (paymentMethod: string) => {
    if (!selectedTier) return

    try {
      // In a real implementation, this would redirect to the payment provider
      // For now, we'll simulate a successful purchase
      toast.info(`Redirecting to ${paymentMethod} for payment...`)
      
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // This would be handled by webhook in production
      const response = await fetch("/api/boosters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierId: selectedTier.id,
          paymentMethod,
          paymentReference: `demo_${Date.now()}`,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast.success(`${selectedTier.name} Booster activated!`, {
          description: `Expires: ${new Date(result.booster.expiresAt).toLocaleDateString()}`
        })
        mutate()
      } else {
        toast.error("Purchase failed", { description: result.error })
      }
    } catch (error) {
      toast.error("Purchase failed", { description: "Please try again later" })
    }

    setDialogOpen(false)
    setSelectedTier(null)
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
      />
    </div>
  )
}

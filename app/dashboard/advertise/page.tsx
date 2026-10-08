"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Megaphone,
  Wallet,
  TrendingUp,
  Eye,
  MousePointer,
  DollarSign,
  Plus,
  Pause,
  Play,
  Square,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  CreditCard,
  Zap,
  Globe,
  BarChart3,
  Target,
  Users,
  ArrowUpRight,
  Copy,
  QrCode,
  History,
  Settings,
  Sparkles,
  Shield,
  TrendingDown,
  Filter,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  FileText,
  Bell,
  Star,
  Rocket,
  Award,
  PieChart
,
  Coins } from "lucide-react"
import { toast } from "sonner"
import useSWR from "swr"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCsrf } from "@/hooks/use-csrf"
import { AD_NETWORK_CONFIG } from "@/lib/config/ad-networks"

// Ad network data comes from the SHARED single source of truth
// (lib/config/ad-networks.ts) so the UI can never drift from the API's
// validation, minimum budgets, or CPMs again. Only the icon components are
// resolved locally — the shared config stores an `iconKey` string because
// component references cannot be serialized/shared with the server route.
const NETWORK_ICONS: Record<string, LucideIcon> = {
  Globe,
  Zap,
  BarChart3,
  FileText,
  Bell,
  Eye,
  Award,
  Megaphone,
}

const AD_NETWORKS = Object.fromEntries(
  Object.entries(AD_NETWORK_CONFIG).map(([key, cfg]) => [
    key,
    { ...cfg, icon: NETWORK_ICONS[cfg.iconKey] ?? Globe },
  ]),
) as Record<string, (typeof AD_NETWORK_CONFIG)[string] & { icon: LucideIcon }>


interface Campaign {
  id: string
  name: string
  network: string
  network_name: string
  budget: number
  daily_budget: number
  spent: number
  target_url: string
  title: string
  description?: string
  status: string
  impressions: number
  clicks: number
  conversions: number
  cpm: number
  ctr: number
  created_at: string
  targeting?: {
    countries: string[]
    devices: string[]
    os: string[]
  }
}

interface DepositRecord {
  id: string
  amount_usd: number
  status: string
  coin_id?: string
  created_at: string
  pay_address?: string
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

// Crypto deposit options
const DEPOSIT_COINS = [
  { id: "BTC", name: "Bitcoin", color: "text-orange-500", bgColor: "bg-orange-500/10" },
  { id: "ETH", name: "Ethereum", color: "text-blue-500", bgColor: "bg-blue-500/10" },
  { id: "USDT", name: "Tether", color: "text-green-500", bgColor: "bg-green-500/10" },
  { id: "USDC", name: "USD Coin", color: "text-blue-400", bgColor: "bg-blue-400/10" },
  { id: "LTC", name: "Litecoin", color: "text-gray-400", bgColor: "bg-gray-400/10" },
  { id: "SOL", name: "Solana", color: "text-purple-500", bgColor: "bg-purple-500/10" },
]

export default function AdvertisePage() {
  const { csrfHeaders } = useCsrf()
  const [activeTab, setActiveTab] = useState("campaigns")
  const [isDepositOpen, setIsDepositOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [depositAmount, setDepositAmount] = useState("")
  const [depositCoin, setDepositCoin] = useState("USDT")
  const [isDepositing, setIsDepositing] = useState(false)
  const [fpDepositAmount, setFpDepositAmount] = useState("")
  const [isFpDepositing, setIsFpDepositing] = useState(false)
  const [fpmAmount, setFpmAmount] = useState("")
  const [isFpmLoading, setIsFpmLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [depositAddress, setDepositAddress] = useState<string | null>(null)
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null)
  const [campaignFilter, setCampaignFilter] = useState<string>("all")

  // Campaign form state
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    network: "",
    budget: "",
    dailyBudget: "",
    targetUrl: "",
    imageUrl: "",
    title: "",
    description: "",
    targeting: {
      countries: [] as string[],
      devices: ["desktop", "mobile", "tablet"],
      os: ["windows", "macos", "ios", "android"]
    }
  })

  const { data: balanceData, mutate: refreshBalance } = useSWR(
    "/api/advertise?balance=true",
    fetcher,
    { refreshInterval: 10000 }
  )

  const { data: campaignsData, mutate: refreshCampaigns } = useSWR(
    "/api/advertise",
    fetcher,
    { refreshInterval: 30000 }
  )

  const { data: depositsData, mutate: refreshDeposits } = useSWR(
    "/api/ccpayment/deposit",
    fetcher,
    { refreshInterval: 30000 }
  )

  const { data: statsData } = useSWR(
    "/api/advertise/stats?days=30",
    fetcher,
    { refreshInterval: 60000 }
  )

  const campaigns: Campaign[] = campaignsData?.campaigns || []
  const balance = balanceData?.balance || 0
  const deposits: DepositRecord[] = depositsData?.deposits || []
  const dailyStats = statsData?.totals || {
    impressions: 0,
    viewable: 0,
    clicks: 0,
    conversions: 0,
    spend: 0,
    ctr: 0,
    viewability: 0,
    ecpm: 0,
  }

  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    if (campaignFilter === "all") return campaigns
    return campaigns.filter(c => c.status === campaignFilter)
  }, [campaigns, campaignFilter])

  // Stats calculations
  const activeCampaigns = campaigns.filter(c => c.status === "active")
  const totalSpent = campaigns.reduce((sum, c) => sum + (c.spent || 0), 0)
  const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0)
  const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0)
  const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0)
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : "0.00"

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) < 5) {
      toast.error("Minimum deposit is $5")
      return
    }

    setIsDepositing(true)
    try {
      const response = await fetch("/api/ccpayment/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(depositAmount),
          currency: "USD",
          coinId: depositCoin,
          purpose: "advertising"
        })
      })

      const data = await response.json()
      if (data.success) {
        toast.success("Deposit address generated!", {
          description: "Send the exact amount to the address shown"
        })
        setDepositAddress(data.order?.payAddress || null)
        refreshDeposits()
      } else {
        toast.error(data.error || "Failed to create deposit")
      }
    } catch {
      toast.error("Failed to create deposit")
    } finally {
      setIsDepositing(false)
    }
  }

  // Deposit advertising funds directly from the user's on-platform satoshi
  // balance via FaucetPay. The satoshis leave their earning balance and are
  // credited to ad_balance_usd at the live BTC/USD rate.
  const handleFaucetPayDeposit = async () => {
    const amount = parseFloat(fpDepositAmount)
    if (!amount || amount < 5) {
      toast.error("Minimum deposit is $5")
      return
    }

    setIsFpDepositing(true)
    try {
      const response = await fetch("/api/advertise/deposit-faucetpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      })
      const data = await response.json()

      if (data.success) {
        toast.success(`${amount.toFixed(2)} USD credited to your advertising balance!`, {
          description: `Charged ${data.satoshisCharged?.toLocaleString()} satoshis at the live BTC rate ($${data.btcUsd?.toLocaleString()})`,
        })
        setFpDepositAmount("")
        refreshBalance()
      } else {
        toast.error(data.error || "Deposit failed")
      }
    } catch {
      toast.error("Deposit failed")
    } finally {
      setIsFpDepositing(false)
    }
  }

  // Deposit advertising funds via FaucetPay Merchant checkout (external wallet).
  const handleFaucetPayMerchantDeposit = async () => {
    const amount = parseFloat(fpmAmount)
    if (!amount || amount < 5) {
      toast.error("Minimum deposit is $5")
      return
    }

    setIsFpmLoading(true)
    try {
      const response = await fetch("/api/deposit/faucetpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency: "USDT", purpose: "advertising" }),
      })
      const data = await response.json()

      if (data.success && data.merchantUrl) {
        toast.info("Redirecting to FaucetPay…")
        window.location.href = data.merchantUrl
      } else {
        toast.error(data.error || "Could not start the FaucetPay deposit")
      }
    } catch {
      toast.error("Deposit failed to start")
    } finally {
      setIsFpmLoading(false)
    }
  }

  // Withdraw unused advertising balance to FaucetPay (USDT, 1:1 USD).
  const [cashoutAmount, setCashoutAmount] = useState("")
  const [isCashingOut, setIsCashingOut] = useState(false)
  const handleCashout = async () => {
    const amount = parseFloat(cashoutAmount)
    if (!amount || amount < 1) {
      toast.error("Minimum withdrawal is $1")
      return
    }

    setIsCashingOut(true)
    try {
      const response = await fetch("/api/advertise/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      })
      const data = await response.json()

      if (data.success) {
        toast.success(data.message || "Withdrawal sent!")
        setCashoutAmount("")
        refreshBalance()
      } else {
        toast.error(data.error || "Withdrawal failed")
      }
    } catch {
      toast.error("Withdrawal failed")
    } finally {
      setIsCashingOut(false)
    }
  }

  const handleCreateCampaign = async () => {
    const { name, network, budget, dailyBudget, targetUrl, imageUrl, title, description, targeting } = campaignForm

    if (!name || !network || !budget || !dailyBudget || !targetUrl || !imageUrl || !title) {
      toast.error("Please fill in all required fields")
      return
    }

    const budgetNum = parseFloat(budget)
    const dailyBudgetNum = parseFloat(dailyBudget)

    if (budgetNum > balance) {
      toast.error("Insufficient balance")
      return
    }

    const networkConfig = AD_NETWORKS[network as keyof typeof AD_NETWORKS]
    if (networkConfig && budgetNum < networkConfig.minBudget) {
      toast.error(`Minimum budget for ${networkConfig.name} is $${networkConfig.minBudget}`)
      return
    }

    setIsCreating(true)
    try {
      const csrf = await csrfHeaders()
      const response = await fetch("/api/advertise", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrf },
        body: JSON.stringify({
          name,
          network,
          budget: budgetNum,
          dailyBudget: dailyBudgetNum,
          targetUrl,
          imageUrl,
          title,
          description,
          targeting
        })
      })

      const data = await response.json()
      if (data.success) {
        toast.success("Campaign created!", {
          description: "Your campaign will be reviewed and activated within 24 hours"
        })
        setIsCreateOpen(false)
        setCampaignForm({
          name: "", network: "", budget: "", dailyBudget: "",
          targetUrl: "", imageUrl: "", title: "", description: "",
          targeting: { countries: [], devices: ["desktop", "mobile", "tablet"], os: ["windows", "macos", "ios", "android"] }
        })
        refreshCampaigns()
        refreshBalance()
      } else {
        toast.error(data.error || "Failed to create campaign")
      }
    } catch {
      toast.error("Failed to create campaign")
    } finally {
      setIsCreating(false)
    }
  }

  const handleCampaignAction = async (campaignId: string, action: string) => {
    try {
      const csrf = await csrfHeaders()
      const response = await fetch("/api/advertise", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...csrf },
        body: JSON.stringify({ campaignId, action })
      })

      const data = await response.json()
      if (data.success) {
        toast.success(`Campaign ${action === "stop" ? "stopped" : action === "pause" ? "paused" : "resumed"}`)
        refreshCampaigns()
        if (action === "stop") refreshBalance()
      } else {
        toast.error(data.error || "Action failed")
      }
    } catch {
      toast.error("Action failed")
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock; color: string }> = {
      active: { variant: "default", icon: Play, color: "text-green-500" },
      pending: { variant: "secondary", icon: Clock, color: "text-yellow-500" },
      paused: { variant: "outline", icon: Pause, color: "text-blue-500" },
      stopped: { variant: "destructive", icon: Square, color: "text-red-500" },
      completed: { variant: "secondary", icon: CheckCircle2, color: "text-gray-500" }
    }
    const config = statusConfig[status] || statusConfig.pending
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className={cn("h-3 w-3", config.color)} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-primary" />
            Advertising Center
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Faucero first-party ad inventory with transparent review and billing
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isDepositOpen} onOpenChange={setIsDepositOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Wallet className="h-4 w-4" />
                Deposit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Deposit Advertising Funds
                </DialogTitle>
                <DialogDescription>
                  Add funds using cryptocurrency via CCPayment
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                {!depositAddress ? (
                  <>
                    {/* Amount Selection */}
                    <div className="space-y-2">
                      <Label>Amount (USD)</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        min="5"
                        step="0.01"
                        className="text-lg font-mono"
                      />
                      <div className="flex flex-wrap gap-2">
                        {[10, 25, 50, 100, 250, 500].map((amount) => (
                          <Button
                            key={amount}
                            variant={depositAmount === amount.toString() ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => setDepositAmount(amount.toString())}
                          >
                            ${amount}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Coin Selection */}
                    <div className="space-y-2">
                      <Label>Pay with</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {DEPOSIT_COINS.map((coin) => (
                          <button
                            key={coin.id}
                            type="button"
                            onClick={() => setDepositCoin(coin.id)}
                            className={cn(
                              "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all",
                              depositCoin === coin.id
                                ? "border-primary bg-primary/5"
                                : "hover:bg-muted/50"
                            )}
                          >
                            <div className={cn("p-2 rounded-full", coin.bgColor)}>
                              <span className={cn("text-xs font-bold", coin.color)}>{coin.id}</span>
                            </div>
                            <span className="text-xs">{coin.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <Button
                      className="w-full h-12 text-base bg-gradient-to-r from-primary to-primary/80"
                      onClick={handleDeposit}
                      disabled={isDepositing || !depositAmount}
                    >
                      {isDepositing ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Generating Address...
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-5 w-5 mr-2" />
                          Generate {depositCoin} Address
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Payment Address Display */}
                    <div className="text-center space-y-4">
                      <div className="p-4 bg-muted rounded-lg">
                        <QrCode className="h-32 w-32 mx-auto mb-4 text-primary" />
                        <p className="text-sm text-muted-foreground mb-2">Send exactly:</p>
                        <p className="text-2xl font-bold text-primary">${depositAmount} in {depositCoin}</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Payment Address</Label>
                        <div className="flex gap-2">
                          <Input
                            value={depositAddress}
                            readOnly
                            className="font-mono text-xs"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(depositAddress)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-amber-500">
                        <Clock className="h-4 w-4" />
                        <span>Address expires in 60 minutes</span>
                      </div>

                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setDepositAddress(null)
                          setDepositAmount("")
                          refreshBalance()
                        }}
                      >
                        Create New Deposit
                      </Button>
                    </div>
                  </>
                )}

                {/* Pay with FaucetPay (external wallet checkout) */}
                <div className="pt-4 border-t space-y-3">
                  <div>
                    <Label className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-primary" />
                      Or deposit with FaucetPay
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      BTC, ETH, LTC, USDT & more — pay from your FaucetPay wallet or send from any address. Credited automatically after confirmation.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="USD amount (min $5)"
                      value={fpmAmount}
                      onChange={(e) => setFpmAmount(e.target.value)}
                      min="5"
                      step="0.01"
                      className="font-mono"
                    />
                    <Button
                      onClick={handleFaucetPayMerchantDeposit}
                      disabled={isFpmLoading || !fpmAmount || parseFloat(fpmAmount) < 5}
                      className="shrink-0"
                    >
                      {isFpmLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Starting…
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Pay with FaucetPay
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Pay from Site Balance (FaucetPay satoshis) */}
                <div className="pt-4 border-t space-y-3">
                  <div>
                    <Label className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-primary" />
                      Or pay from your site balance
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Instantly convert satoshis from your earning balance to advertising credit at the live BTC rate. No waiting for confirmations.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="USD amount (min $5)"
                      value={fpDepositAmount}
                      onChange={(e) => setFpDepositAmount(e.target.value)}
                      min="5"
                      step="0.01"
                      className="font-mono"
                    />
                    <Button
                      onClick={handleFaucetPayDeposit}
                      disabled={isFpDepositing || !fpDepositAmount || parseFloat(fpDepositAmount) < 5}
                      className="shrink-0"
                    >
                      {isFpDepositing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing…
                        </>
                      ) : (
                        "Credit Now"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Recent Deposits */}
                {deposits.length > 0 && !depositAddress && (
                  <div className="space-y-2 pt-4 border-t">
                    <Label className="flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Recent Deposits
                    </Label>
                    <ScrollArea className="h-[120px]">
                      <div className="space-y-2">
                        {deposits.slice(0, 5).map((dep) => (
                          <div
                            key={dep.id}
                            className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm"
                          >
                            <div>
                              <span className="font-medium">${dep.amount_usd}</span>
                              <span className="text-muted-foreground ml-2">
                                {new Date(dep.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <Badge
                              variant={dep.status === "completed" ? "default" :
                                dep.status === "pending" ? "secondary" : "destructive"}
                            >
                              {dep.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

        {/* Withdraw unused advertising balance to FaucetPay */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Withdraw
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Withdraw Ad Balance
              </DialogTitle>
              <DialogDescription>
                Send unused advertising credit to your FaucetPay account as USDT (1 USD = 1 USDT).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-muted/50 text-sm flex justify-between">
                <span className="text-muted-foreground">Available</span>
                <span className="font-bold">${(balance || 0).toFixed(2)}</span>
              </div>
              <div className="space-y-2">
                <Label>Amount (USD)</Label>
                <Input
                  type="number"
                  placeholder="Minimum $1"
                  value={cashoutAmount}
                  onChange={(e) => setCashoutAmount(e.target.value)}
                  min="1"
                  step="0.01"
                  className="font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Paid instantly to your linked FaucetPay email as USDT.
              </p>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCashout}
                disabled={isCashingOut || !cashoutAmount || parseFloat(cashoutAmount) < 1 || (balance || 0) < parseFloat(cashoutAmount || "0")}
              >
                {isCashingOut ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Withdraw to FaucetPay"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-gradient-to-r from-primary to-primary/80">
                <Plus className="h-4 w-4" />
                Create Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" />
                  Create Advertising Campaign
                </DialogTitle>
                <DialogDescription>
                  Set up a reviewed campaign for Faucero first-party placements
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                {/* Network Selection */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Select Ad Network *</Label>
                  <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                    {Object.entries(AD_NETWORKS).map(([key, net]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCampaignForm(f => ({ ...f, network: key }))}
                        className={cn(
                          "relative flex flex-col p-3 sm:p-4 rounded-xl border text-left transition-all min-w-0",
                          campaignForm.network === key
                            ? "border-primary bg-primary/5 ring-2 ring-primary/50"
                            : "hover:bg-muted/50 hover:border-muted-foreground/30"
                        )}
                      >
                        {/* Header with logo, name, and badge */}
                        <div className="flex items-center gap-3 w-full">
                          <div className="relative h-11 w-11 sm:h-12 sm:w-12 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0">
                            {net.logo ? (
                              <img
                                src={net.logo}
                                alt={net.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className={cn("p-2 rounded-xl bg-gradient-to-br w-full h-full flex items-center justify-center", net.color)}>
                                <net.icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm sm:text-base">{net.name}</span>
                              {net.recommended && (
                                <Badge className="text-[9px] sm:text-[10px] shrink-0 px-1.5 py-0.5 bg-amber-500/10 text-amber-500 border-amber-500/20" variant="outline">
                                  <Star className="h-2.5 w-2.5 mr-0.5 fill-amber-500" />
                                  Top
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{net.description}</p>
                          </div>
                        </div>

                        {/* Features */}
                        <div className="flex flex-wrap gap-1 sm:gap-1.5 mt-3">
                          {net.features.slice(0, 3).map((f, i) => (
                            <Badge key={i} variant="outline" className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 bg-muted/50">
                              {f}
                            </Badge>
                          ))}
                        </div>

                        {/* Stats */}
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50 text-[10px] sm:text-xs text-muted-foreground">
                          <span className="flex flex-col sm:flex-row sm:gap-1">
                            <span className="font-medium text-foreground/70">Min:</span>
                            <span>${net.minBudget}</span>
                          </span>
                          <span className="flex flex-col sm:flex-row sm:gap-1">
                            <span className="font-medium text-foreground/70">CPM:</span>
                            <span>${net.cpm}</span>
                          </span>
                          <span className="flex flex-col sm:flex-row sm:gap-1">
                            <span className="font-medium text-foreground/70">CTR:</span>
                            <span>Measured after delivery</span>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campaign Details */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Campaign Name *</Label>
                    <Input
                      placeholder="My Awesome Campaign"
                      value={campaignForm.name}
                      onChange={(e) => setCampaignForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Target URL *</Label>
                    <Input
                      type="url"
                      placeholder="https://your-website.com"
                      value={campaignForm.targetUrl}
                      onChange={(e) => setCampaignForm(f => ({ ...f, targetUrl: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Creative Image URL *</Label>
                    <Input
                      type="url"
                      placeholder="https://cdn.your-site.com/ad-image.png"
                      value={campaignForm.imageUrl}
                      onChange={(e) => setCampaignForm(f => ({ ...f, imageUrl: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Public HTTPS image URL; it will be reviewed before delivery.</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Total Budget ($) *</Label>
                    <Input
                      type="number"
                      placeholder="100.00"
                      value={campaignForm.budget}
                      onChange={(e) => setCampaignForm(f => ({ ...f, budget: e.target.value }))}
                      min="5"
                    />
                    <p className="text-xs text-muted-foreground">
                      Available: ${balance.toFixed(2)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Daily Budget ($) *</Label>
                    <Input
                      type="number"
                      placeholder="10.00"
                      value={campaignForm.dailyBudget}
                      onChange={(e) => setCampaignForm(f => ({ ...f, dailyBudget: e.target.value }))}
                      min="1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Ad Title *</Label>
                  <Input
                    placeholder="Your compelling headline"
                    value={campaignForm.title}
                    onChange={(e) => setCampaignForm(f => ({ ...f, title: e.target.value }))}
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {campaignForm.title.length}/100
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Ad Description</Label>
                  <Textarea
                    placeholder="Describe your offer, product or service..."
                    value={campaignForm.description}
                    onChange={(e) => setCampaignForm(f => ({ ...f, description: e.target.value }))}
                    maxLength={500}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {campaignForm.description.length}/500
                  </p>
                </div>

                {/* Advanced Targeting */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="targeting">
                    <AccordionTrigger className="text-sm">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Advanced Targeting Options
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Devices</Label>
                        <div className="flex flex-wrap gap-2">
                          {["desktop", "mobile", "tablet"].map((device) => (
                            <Badge
                              key={device}
                              variant={campaignForm.targeting.devices.includes(device) ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => {
                                const devices = campaignForm.targeting.devices.includes(device)
                                  ? campaignForm.targeting.devices.filter(d => d !== device)
                                  : [...campaignForm.targeting.devices, device]
                                setCampaignForm(f => ({
                                  ...f,
                                  targeting: { ...f.targeting, devices }
                                }))
                              }}
                            >
                              {device.charAt(0).toUpperCase() + device.slice(1)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Operating Systems</Label>
                        <div className="flex flex-wrap gap-2">
                          {["windows", "macos", "ios", "android", "linux"].map((os) => (
                            <Badge
                              key={os}
                              variant={campaignForm.targeting.os.includes(os) ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => {
                                const osArr = campaignForm.targeting.os.includes(os)
                                  ? campaignForm.targeting.os.filter(o => o !== os)
                                  : [...campaignForm.targeting.os, os]
                                setCampaignForm(f => ({
                                  ...f,
                                  targeting: { ...f.targeting, os: osArr }
                                }))
                              }}
                            >
                              {os.toUpperCase()}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Estimated Reach */}
                {campaignForm.network && campaignForm.budget && (
                  <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-4">
                    <p className="text-sm font-medium mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Estimated Performance
                    </p>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="text-center">
                        <p className="text-muted-foreground text-xs">Est. Impressions</p>
                        <p className="text-xl font-bold text-primary">
                          {Math.floor((parseFloat(campaignForm.budget) / AD_NETWORKS[campaignForm.network as keyof typeof AD_NETWORKS]?.cpm) * 1000).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground text-xs">Est. Clicks</p>
                        <p className="text-xl font-bold">
                          {Math.floor((parseFloat(campaignForm.budget) / AD_NETWORKS[campaignForm.network as keyof typeof AD_NETWORKS]?.cpm) * 1000 * 0.02).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground text-xs">Campaign Duration</p>
                        <p className="text-xl font-bold">
                          ~{Math.ceil(parseFloat(campaignForm.budget) / parseFloat(campaignForm.dailyBudget || "10"))} days
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full h-12 text-base bg-gradient-to-r from-primary to-primary/80"
                  onClick={handleCreateCampaign}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Creating Campaign...
                    </>
                  ) : (
                    <>
                      <Rocket className="h-5 w-5 mr-2" />
                      Launch Campaign
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ad Balance</p>
                <p className="text-2xl font-bold">${balance.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Campaigns</p>
                <p className="text-2xl font-bold">{activeCampaigns.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Eye className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Impressions</p>
                <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <MousePointer className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clicks</p>
                <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <PieChart className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg CTR</p>
                <p className="text-2xl font-bold">{avgCtr}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="campaigns" className="gap-2">
            <Megaphone className="h-4 w-4" />
            Campaigns
          </TabsTrigger>
          <TabsTrigger value="networks" className="gap-2">
            <Globe className="h-4 w-4" />
            Networks
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="mt-6 space-y-4">
          {/* Filters */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {["all", "active", "pending", "paused", "stopped"].map((filter) => (
                <Button
                  key={filter}
                  variant={campaignFilter === filter ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setCampaignFilter(filter)}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  {filter !== "all" && (
                    <Badge variant="outline" className="ml-1 h-5 px-1">
                      {campaigns.filter(c => filter === "all" ? true : c.status === filter).length}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => refreshCampaigns()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Campaign List */}
          {filteredCampaigns.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  {campaignFilter === "all" ? "No campaigns yet" : `No ${campaignFilter} campaigns`}
                </p>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Campaign
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredCampaigns.map((campaign) => {
                const network = AD_NETWORKS[campaign.network as keyof typeof AD_NETWORKS]
                return (
                  <Card key={campaign.id} className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex flex-col lg:flex-row">
                        {/* Campaign Info */}
                        <div className="flex-1 p-4 lg:p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className={cn("p-2 rounded-lg bg-gradient-to-br", network?.color || "from-gray-500 to-gray-600")}>
                                {network?.icon && <network.icon className="h-5 w-5 text-white" />}
                              </div>
                              <div>
                                <h3 className="font-semibold flex items-center gap-2">
                                  {campaign.name}
                                  {getStatusBadge(campaign.status)}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  {campaign.network_name || network?.name}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {campaign.status === "active" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCampaignAction(campaign.id, "pause")}
                                >
                                  <Pause className="h-4 w-4" />
                                </Button>
                              )}
                              {campaign.status === "paused" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCampaignAction(campaign.id, "resume")}
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                              )}
                              {["active", "paused", "pending"].includes(campaign.status) && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleCampaignAction(campaign.id, "stop")}
                                >
                                  <Square className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Impressions</p>
                              <p className="text-lg font-semibold">{campaign.impressions.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Clicks</p>
                              <p className="text-lg font-semibold">{campaign.clicks.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">CTR</p>
                              <p className="text-lg font-semibold">
                                {campaign.impressions > 0
                                  ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2)
                                  : "0.00"}%
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Conversions</p>
                              <p className="text-lg font-semibold">{(campaign.conversions || 0).toLocaleString()}</p>
                            </div>
                          </div>

                          {/* Budget Progress */}
                          <div>
                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                              <span>Budget: ${campaign.spent.toFixed(2)} / ${campaign.budget}</span>
                              <span>{((campaign.spent / campaign.budget) * 100).toFixed(1)}%</span>
                            </div>
                            <Progress value={(campaign.spent / campaign.budget) * 100} className="h-2" />
                          </div>
                        </div>

                        {/* Quick Stats Sidebar */}
                        <div className="border-t lg:border-t-0 lg:border-l bg-muted/30 p-4 lg:w-48 flex lg:flex-col justify-around lg:justify-center gap-4">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Daily Spend</p>
                            <p className="font-bold">${campaign.daily_budget}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">CPM</p>
                            <p className="font-bold">${campaign.cpm || network?.cpm || "0.00"}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">CPC</p>
                            <p className="font-bold">
                              ${campaign.clicks > 0
                                ? (campaign.spent / campaign.clicks).toFixed(2)
                                : "0.00"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Networks Tab */}
        <TabsContent value="networks" className="mt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(AD_NETWORKS).map(([key, net]) => (
              <Card
                key={key}
                className={cn(
                  "transition-all hover:shadow-lg cursor-pointer",
                  selectedNetwork === key ? "ring-2 ring-primary" : ""
                )}
                onClick={() => {
                  setSelectedNetwork(key)
                  setCampaignForm(f => ({ ...f, network: key }))
                  setIsCreateOpen(true)
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="relative h-14 w-14 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                      {net.logo ? (
                        <img
                          src={net.logo}
                          alt={net.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className={cn("p-3 rounded-xl bg-gradient-to-br w-full h-full flex items-center justify-center", net.color)}>
                          <net.icon className="h-6 w-6 text-white" />
                        </div>
                      )}
                    </div>
                    {net.recommended && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="h-3 w-3" />
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="mt-3">{net.name}</CardTitle>
                  <CardDescription>{net.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {net.features.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {f}
                      </Badge>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Min Budget</p>
                      <p className="font-semibold">${net.minBudget}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">CPM</p>
                      <p className="font-semibold">${net.cpm}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Avg CTR</p>
                      <p className="font-semibold text-muted-foreground">Measured after delivery</p>
                    </div>
                  </div>
                  <Button className="w-full mt-4" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-6 space-y-6">
          {/* Performance Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Performance Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Spend (last 30 days)</p>
                  <p className="text-3xl font-bold">${dailyStats.spend.toFixed(4)}</p>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    <span>eCPM ${dailyStats.ecpm.toFixed(4)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Impressions (last 30 days)</p>
                  <p className="text-3xl font-bold">{dailyStats.impressions.toLocaleString()}</p>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Eye className="h-4 w-4" />
                    <span>{dailyStats.viewability.toFixed(2)}% viewability</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Clicks (last 30 days)</p>
                  <p className="text-3xl font-bold">{dailyStats.clicks.toLocaleString()}</p>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MousePointer className="h-4 w-4" />
                    <span>{dailyStats.ctr.toFixed(2)}% CTR</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Conversions (last 30 days)</p>
                  <p className="text-3xl font-bold">{dailyStats.conversions.toLocaleString()}</p>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <PieChart className="h-4 w-4" />
                    <span>Daily rollup</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Performing Campaigns */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-500" />
                Top Performing Campaigns
              </CardTitle>
            </CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No campaign data yet. Create your first campaign to see analytics.
                </p>
              ) : (
                <div className="space-y-4">
                  {campaigns
                    .sort((a, b) => b.clicks - a.clicks)
                    .slice(0, 5)
                    .map((campaign, index) => (
                      <div
                        key={campaign.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center font-bold",
                            index === 0 ? "bg-yellow-500 text-yellow-950" :
                              index === 1 ? "bg-gray-400 text-gray-950" :
                                index === 2 ? "bg-amber-600 text-amber-950" :
                                  "bg-muted text-muted-foreground"
                          )}>
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium">{campaign.name}</p>
                            <p className="text-sm text-muted-foreground">{campaign.network_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right">
                            <p className="text-muted-foreground">Clicks</p>
                            <p className="font-medium">{campaign.clicks.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground">CTR</p>
                            <p className="font-medium text-green-500">
                              {campaign.impressions > 0
                                ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2)
                                : "0.00"}%
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Info Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Advertising with Crypto</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>1. Deposit funds using any supported cryptocurrency via CCPayment</li>
                <li>2. Create a reviewed campaign for Faucero first-party inventory</li>
                <li>3. Target by device, location, and operating system</li>
                <li>4. Real-time analytics and performance tracking</li>
                <li>5. Pause or stop campaigns anytime - unused budget is refundable</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

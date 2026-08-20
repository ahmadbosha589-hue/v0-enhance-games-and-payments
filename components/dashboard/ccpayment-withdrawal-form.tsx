"use client"

import { useState, useEffect, useMemo } from "react"
import type { Profile } from "@/lib/types/database"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatSatoshisDisplay } from "@/lib/utils/format"
import {
  Loader2,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Info,
  Bitcoin,
  ArrowRight,
  Clock,
  TrendingUp,
  Shield,
  Zap,
  Copy,
  ExternalLink,
  QrCode,
  History,
  ChevronRight
} from "lucide-react"
import { toast } from "sonner"
import useSWR from "swr"
import { cn } from "@/lib/utils"

interface CCPaymentWithdrawalFormProps {
  profile: Profile
  canWithdraw: boolean
}

interface CoinInfo {
  coinId: string
  symbol: string
  name: string
  chains: Array<{
    chainId: string
    chainName: string
    minWithdrawAmount: string
    withdrawFee: string
    estimatedTime?: string
  }>
  price?: string
  change24h?: number
}

interface WithdrawalRecord {
  id: string
  coin_id: string
  chain: string
  address: string
  amount_satoshis: number
  amount_crypto: string
  status: string
  created_at: string
  tx_hash?: string
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface CryptoPrice {
  symbol: string
  name: string
  price: number
  change24h: number
  volume24h: string
  marketCap: string
}

// Popular coins with icons
const COIN_ICONS: Record<string, { color: string; bgColor: string }> = {
  BTC: { color: "text-orange-500", bgColor: "bg-orange-500/10" },
  ETH: { color: "text-blue-500", bgColor: "bg-blue-500/10" },
  USDT: { color: "text-green-500", bgColor: "bg-green-500/10" },
  USDC: { color: "text-blue-400", bgColor: "bg-blue-400/10" },
  LTC: { color: "text-gray-400", bgColor: "bg-gray-400/10" },
  BNB: { color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  XRP: { color: "text-slate-400", bgColor: "bg-slate-400/10" },
  DOGE: { color: "text-amber-500", bgColor: "bg-amber-500/10" },
  SOL: { color: "text-purple-500", bgColor: "bg-purple-500/10" },
  TRX: { color: "text-red-500", bgColor: "bg-red-500/10" },
  MATIC: { color: "text-violet-500", bgColor: "bg-violet-500/10" },
  ADA: { color: "text-cyan-500", bgColor: "bg-cyan-500/10" },
}

// Coin and network metadata is supplied by the live CCPayment endpoint.
// Live prices are required for USD presentation; no synthetic conversion rate is used.

export function CCPaymentWithdrawalForm({ profile, canWithdraw }: CCPaymentWithdrawalFormProps) {
  const [selectedCoin, setSelectedCoin] = useState("")
  const [selectedChain, setSelectedChain] = useState("")
  const [address, setAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [memo, setMemo] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [activeTab, setActiveTab] = useState("withdraw")
  const [searchCoin, setSearchCoin] = useState("")

  const { data: coinsData, isLoading: isLoadingCoins } = useSWR("/api/ccpayment/withdraw?coins=true", fetcher)
  const { data: historyData, mutate: refreshHistory } = useSWR("/api/ccpayment/withdraw", fetcher)

  // Fetch real crypto prices
  const { data: pricesData } = useSWR<{ prices: Record<string, CryptoPrice> }>(
    "/api/crypto/prices",
    fetcher,
    { refreshInterval: 60000 }
  )

  // Merge real prices into coins
  const coins: CoinInfo[] = useMemo(() => {
    const baseCoins = coinsData?.coins || []
    return baseCoins.map((coin: CoinInfo) => {
      const priceData = pricesData?.prices?.[coin.symbol]
      if (priceData) {
        return {
          ...coin,
          price: priceData.price.toString(),
          change24h: priceData.change24h,
        }
      }
      return coin
    })
  }, [coinsData, pricesData])
  const withdrawals: WithdrawalRecord[] = historyData?.withdrawals || []

  const filteredCoins = useMemo(() => {
    if (!searchCoin) return coins
    const search = searchCoin.toLowerCase()
    return coins.filter(c =>
      c.symbol.toLowerCase().includes(search) ||
      c.name.toLowerCase().includes(search)
    )
  }, [coins, searchCoin])

  const selectedCoinInfo = coins.find(c => c.coinId === selectedCoin)
  const selectedChainInfo = selectedCoinInfo?.chains.find(c => c.chainId === selectedChain)

  const amountNum = parseInt(amount) || 0
  const minWithdraw = 10000 // Minimum 10,000 satoshis

  const btcUsdPrice = Number(pricesData?.prices?.BTC?.price || 0)
  const usdValue = btcUsdPrice > 0 ? (amountNum / 100000000) * btcUsdPrice : 0
  const cryptoValue = useMemo(() => {
    if (!selectedCoinInfo?.price || usdValue <= 0) return "0"
    return (usdValue / parseFloat(selectedCoinInfo.price)).toFixed(8)
  }, [selectedCoinInfo, usdValue])

  const getValidationErrors = (): string[] => {
    const errors: string[] = []

    if (!selectedCoin) errors.push("Select a cryptocurrency")
    if (!selectedChain) errors.push("Select a network/chain")
    if (!address || address.length < 10) errors.push("Enter a valid wallet address")
    if (amountNum < minWithdraw) errors.push(`Minimum withdrawal is ${minWithdraw.toLocaleString()} satoshis`)
    if (amountNum > Number(profile.balance_satoshis)) errors.push("Insufficient balance")
    if (profile.is_flagged && profile.fraud_score >= 50) {
      errors.push("Account under review - withdrawals temporarily disabled")
    }

    return errors
  }

  const validationErrors = getValidationErrors()
  const isValid = validationErrors.length === 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || !canWithdraw) return
    setShowConfirmDialog(true)
  }

  const confirmWithdrawal = async () => {
    setShowConfirmDialog(false)
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/ccpayment/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coinId: selectedCoin,
          chain: selectedChain,
          address,
          amountSatoshis: amountNum,
          memo: memo || undefined
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to process withdrawal")
      }

      toast.success("Withdrawal submitted!", {
        description: `${amountNum.toLocaleString()} satoshis will be sent to your ${selectedCoin} wallet`
      })

      // Reset form
      setAmount("")
      setAddress("")
      setMemo("")
      refreshHistory()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Withdrawal failed"

      // Provide helpful context based on error type
      let title = "Withdrawal Failed"
      let description = errorMessage

      if (errorMessage.includes("address") || errorMessage.includes("invalid")) {
        title = "Invalid Address"
        description = "Please check your wallet address and make sure it's correct for the selected network."
      } else if (errorMessage.includes("balance") || errorMessage.includes("Insufficient")) {
        title = "Insufficient Balance"
        description = "You don't have enough balance to complete this withdrawal."
      } else if (errorMessage.includes("minimum") || errorMessage.includes("too small")) {
        title = "Amount Too Low"
        description = "The withdrawal amount is below the minimum required for this cryptocurrency."
      } else if (errorMessage.includes("CCPayment") || errorMessage.includes("configured")) {
        title = "Service Unavailable"
        description = "CCPayment service is temporarily unavailable. Please try FaucetPay withdrawal instead."
      } else if (errorMessage.includes("review") || errorMessage.includes("flagged")) {
        title = "Account Review"
        description = "Your account is under review. Please contact support for assistance."
      } else if (errorMessage.includes("network") || errorMessage.includes("chain")) {
        title = "Network Error"
        description = "Please select a valid network/chain for your withdrawal."
      }

      toast.error(title, { description, duration: 6000 })
    } finally {
      setIsSubmitting(false)
    }
  }

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr)
    toast.success("Address copied to clipboard")
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-green-500"
      case "pending": return "text-yellow-500"
      case "failed": return "text-red-500"
      default: return "text-muted-foreground"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return CheckCircle2
      case "pending": return Clock
      case "failed": return AlertCircle
      default: return Info
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500">
            <Bitcoin className="h-5 w-5 text-white" />
          </div>
          Crypto Withdrawal
        </CardTitle>
        <CardDescription>
          Withdraw to 50+ cryptocurrencies via CCPayment - Fast, secure, low fees
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="withdraw" className="gap-2">
              <Wallet className="h-4 w-4" />
              Withdraw
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="withdraw" className="space-y-6 mt-0">
            {/* Balance Card */}
            <div className="rounded-lg border bg-gradient-to-r from-primary/5 to-transparent p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Available Balance</p>
                  <p className="text-2xl font-bold">{formatSatoshisDisplay(profile.balance_satoshis)}</p>
                  <p className="text-xs text-muted-foreground">
                    {btcUsdPrice > 0 ? `≈ $${((Number(profile.balance_satoshis) / 100000000) * btcUsdPrice).toFixed(2)} USD` : "USD value unavailable without live BTC pricing"}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="gap-1">
                    <Shield className="h-3 w-3" />
                    Secured
                  </Badge>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Cryptocurrency Selection */}
              <div className="space-y-2">
                <Label>Select Cryptocurrency</Label>
                <Select value={selectedCoin} onValueChange={(v) => {
                  setSelectedCoin(v)
                  setSelectedChain("")
                }}>
                  <SelectTrigger className="h-auto py-3">
                    <SelectValue placeholder="Choose a crypto">
                      {selectedCoinInfo && (
                        <div className="flex items-center gap-3">
                          <div className={cn("p-1.5 rounded-lg", COIN_ICONS[selectedCoin]?.bgColor || "bg-muted")}>
                            <span className={cn("text-xs font-bold", COIN_ICONS[selectedCoin]?.color)}>
                              {selectedCoin}
                            </span>
                          </div>
                          <div className="text-left">
                            <p className="font-medium">{selectedCoinInfo.name}</p>
                            <p className="text-xs text-muted-foreground">{selectedCoinInfo.symbol}</p>
                          </div>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <div className="p-2 sticky top-0 bg-popover">
                      <Input
                        placeholder="Search coins..."
                        value={searchCoin}
                        onChange={(e) => setSearchCoin(e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <SelectGroup>
                      <SelectLabel>Popular</SelectLabel>
                      {filteredCoins.slice(0, 6).map(coin => (
                        <SelectItem key={coin.coinId} value={coin.coinId}>
                          <div className="flex items-center gap-3 w-full">
                            <div className={cn("p-1.5 rounded-lg", COIN_ICONS[coin.symbol]?.bgColor || "bg-muted")}>
                              <span className={cn("text-xs font-bold", COIN_ICONS[coin.symbol]?.color)}>
                                {coin.symbol}
                              </span>
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{coin.name}</p>
                              <p className="text-xs text-muted-foreground">{coin.chains.length} network(s)</p>
                            </div>
                            {coin.change24h !== undefined && (
                              <Badge variant={coin.change24h >= 0 ? "default" : "destructive"} className="text-xs">
                                {coin.change24h >= 0 ? "+" : ""}{coin.change24h}%
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    {filteredCoins.length > 6 && (
                      <SelectGroup>
                        <SelectLabel>Other Coins</SelectLabel>
                        {filteredCoins.slice(6).map(coin => (
                          <SelectItem key={coin.coinId} value={coin.coinId}>
                            <div className="flex items-center gap-3">
                              <div className={cn("p-1.5 rounded-lg", COIN_ICONS[coin.symbol]?.bgColor || "bg-muted")}>
                                <span className={cn("text-xs font-bold", COIN_ICONS[coin.symbol]?.color)}>
                                  {coin.symbol}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium">{coin.name}</p>
                                <p className="text-xs text-muted-foreground">{coin.chains.length} network(s)</p>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Chain/Network Selection */}
              {selectedCoinInfo && (
                <div className="space-y-2">
                  <Label>Select Network</Label>
                  <div className="grid gap-2">
                    {selectedCoinInfo.chains.map(chain => (
                      <button
                        key={chain.chainId}
                        type="button"
                        onClick={() => setSelectedChain(chain.chainId)}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border text-left transition-all",
                          selectedChain === chain.chainId
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            selectedChain === chain.chainId ? "bg-primary" : "bg-muted-foreground"
                          )} />
                          <div>
                            <p className="font-medium text-sm">{chain.chainName}</p>
                            <p className="text-xs text-muted-foreground">
                              Fee: {chain.withdrawFee} {selectedCoin}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="text-xs gap-1">
                            <Zap className="h-3 w-3" />
                            {chain.estimatedTime || "5-30 min"}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Wallet Address */}
              <div className="space-y-2">
                <Label>Wallet Address</Label>
                <div className="relative">
                  <Input
                    placeholder={`Enter your ${selectedCoin || "crypto"} wallet address`}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="font-mono text-sm pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-8 w-8"
                    onClick={() => navigator.clipboard.readText().then(setAddress)}
                  >
                    <QrCode className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Memo (for coins that need it) */}
              {["XRP", "XLM", "EOS", "ATOM"].includes(selectedCoin) && (
                <div className="space-y-2">
                  <Label>Memo / Tag (Optional)</Label>
                  <Input
                    placeholder="Enter memo or destination tag"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-amber-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Some exchanges require a memo. Double-check before sending.
                  </p>
                </div>
              )}

              {/* Amount */}
              <div className="space-y-2">
                <Label>Amount (Satoshis)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min={minWithdraw}
                    max={Number(profile.balance_satoshis)}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAmount(profile.balance_satoshis.toString())}
                  >
                    Max
                  </Button>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Min: {minWithdraw.toLocaleString()} sats</span>
                  <span>Available: {formatSatoshisDisplay(profile.balance_satoshis)}</span>
                </div>
              </div>

              {/* Conversion Preview */}
              {amountNum > 0 && selectedCoinInfo && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-medium">Withdrawal Summary</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-mono">{amountNum.toLocaleString()} sats</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">USD Value</span>
                      <span className="font-mono">${usdValue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">You Receive (approx.)</span>
                      <span className="font-mono font-bold text-primary">
                        {cryptoValue} {selectedCoin}
                      </span>
                    </div>
                    {selectedChainInfo && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Network Fee</span>
                          <span className="font-mono">{selectedChainInfo.withdrawFee} {selectedCoin}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Est. Time</span>
                          <span className="font-mono">{selectedChainInfo.estimatedTime || "5-30 min"}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Validation Errors */}
              {validationErrors.length > 0 && amountNum > 0 && (
                <div className="space-y-1">
                  {validationErrors.map((error, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full h-12 text-base bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                disabled={!isValid || !canWithdraw || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Wallet className="h-5 w-5 mr-2" />
                    Withdraw {selectedCoin || "Crypto"}
                  </>
                )}
              </Button>

              {/* Info */}
              <p className="text-xs text-center text-muted-foreground">
                Withdrawals are processed within minutes to hours depending on network congestion
              </p>
            </form>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <ScrollArea className="h-[500px]">
              {withdrawals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <History className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No withdrawal history yet</p>
                  <p className="text-sm text-muted-foreground">Your withdrawals will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {withdrawals.map((withdrawal) => {
                    const StatusIcon = getStatusIcon(withdrawal.status)
                    return (
                      <div
                        key={withdrawal.id}
                        className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            COIN_ICONS[withdrawal.coin_id]?.bgColor || "bg-muted"
                          )}>
                            <span className={cn(
                              "text-xs font-bold",
                              COIN_ICONS[withdrawal.coin_id]?.color
                            )}>
                              {withdrawal.coin_id}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {withdrawal.amount_satoshis.toLocaleString()} sats
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {withdrawal.chain} • {new Date(withdrawal.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={withdrawal.status === "completed" ? "default" :
                              withdrawal.status === "pending" ? "secondary" : "destructive"}
                            className="gap-1"
                          >
                            <StatusIcon className="h-3 w-3" />
                            {withdrawal.status}
                          </Badge>
                          {withdrawal.tx_hash && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => window.open(`https://blockchair.com/search?q=${withdrawal.tx_hash}`, "_blank")}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Confirm Withdrawal
            </DialogTitle>
            <DialogDescription>
              Please verify the details before confirming
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-bold">{amountNum.toLocaleString()} satoshis</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cryptocurrency</span>
                <span className="font-bold">{selectedCoin}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network</span>
                <span className="font-bold">{selectedChainInfo?.chainName}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-muted-foreground">Address</span>
                <span className="font-mono text-xs text-right max-w-[200px] break-all">{address}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">You Receive</span>
                <span className="font-bold text-primary">{cryptoValue} {selectedCoin}</span>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm text-amber-500">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Double-check the address. Withdrawals to wrong addresses cannot be recovered.
              </span>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirmDialog(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500"
                onClick={confirmWithdrawal}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Confirm Withdrawal"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  ArrowDownUp, 
  RefreshCw, 
  Clock, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  Loader2,
  Coins,
  ArrowRight
} from "lucide-react"
import { toast } from "sonner"
import useSWR from "swr"
import { cn } from "@/lib/utils"

interface Coin {
  coinId: string
  symbol: string
  name: string
  logoUrl?: string
  price?: string
}

interface SwapQuote {
  fromCoinId: string
  toCoinId: string
  fromAmount: string
  toAmount: string
  rate: string
  fee: string
  validUntil: number
  simulated?: boolean
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

const SUPPORTED_COINS: Coin[] = [
  { coinId: "BTC", symbol: "BTC", name: "Bitcoin" },
  { coinId: "ETH", symbol: "ETH", name: "Ethereum" },
  { coinId: "USDT", symbol: "USDT", name: "Tether" },
  { coinId: "LTC", symbol: "LTC", name: "Litecoin" },
  { coinId: "BNB", symbol: "BNB", name: "BNB" },
  { coinId: "XRP", symbol: "XRP", name: "Ripple" },
  { coinId: "DOGE", symbol: "DOGE", name: "Dogecoin" },
  { coinId: "SOL", symbol: "SOL", name: "Solana" }
]

export function CryptoSwap() {
  const [fromCoin, setFromCoin] = useState<string>("BTC")
  const [toCoin, setToCoin] = useState<string>("ETH")
  const [fromAmount, setFromAmount] = useState<string>("")
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [isLoadingQuote, setIsLoadingQuote] = useState(false)
  const [isSwapping, setIsSwapping] = useState(false)
  const [quoteExpiry, setQuoteExpiry] = useState<number>(0)

  const { data: swapHistory } = useSWR("/api/ccpayment/swap", fetcher, {
    refreshInterval: 30000
  })

  // Fetch quote when inputs change
  const fetchQuote = useCallback(async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0 || fromCoin === toCoin) {
      setQuote(null)
      return
    }

    setIsLoadingQuote(true)
    try {
      const response = await fetch("/api/ccpayment/swap?action=quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromCoinId: fromCoin,
          toCoinId: toCoin,
          amount: fromAmount
        })
      })

      const data = await response.json()
      if (data.success) {
        setQuote(data.quote)
        setQuoteExpiry(Math.floor((data.quote.validUntil - Date.now()) / 1000))
      } else {
        toast.error(data.error || "Failed to get quote")
        setQuote(null)
      }
    } catch (error) {
      toast.error("Failed to fetch quote")
      setQuote(null)
    } finally {
      setIsLoadingQuote(false)
    }
  }, [fromAmount, fromCoin, toCoin])

  // Debounced quote fetch
  useEffect(() => {
    const timer = setTimeout(fetchQuote, 500)
    return () => clearTimeout(timer)
  }, [fetchQuote])

  // Quote expiry countdown
  useEffect(() => {
    if (quoteExpiry <= 0) return
    const interval = setInterval(() => {
      setQuoteExpiry(prev => {
        if (prev <= 1) {
          setQuote(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [quoteExpiry])

  const swapCoins = () => {
    const temp = fromCoin
    setFromCoin(toCoin)
    setToCoin(temp)
    setFromAmount("")
    setQuote(null)
  }

  const executeSwap = async () => {
    if (!quote || !fromAmount) return

    setIsSwapping(true)
    try {
      const response = await fetch("/api/ccpayment/swap?action=execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromCoinId: fromCoin,
          toCoinId: toCoin,
          amount: fromAmount
        })
      })

      const data = await response.json()
      if (data.success) {
        toast.success("Swap initiated successfully!", {
          description: `Swapping ${fromAmount} ${fromCoin} to ${toCoin}`
        })
        setFromAmount("")
        setQuote(null)
      } else {
        toast.error(data.error || "Swap failed")
      }
    } catch (error) {
      toast.error("Failed to execute swap")
    } finally {
      setIsSwapping(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Swap Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
              <ArrowDownUp className="h-5 w-5 text-white" />
            </div>
            Crypto Swap
          </CardTitle>
          <CardDescription>
            Instantly swap between cryptocurrencies with competitive rates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* From */}
          <div className="space-y-2">
            <Label>From</Label>
            <div className="flex gap-2">
              <Select value={fromCoin} onValueChange={setFromCoin}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_COINS.map(coin => (
                    <SelectItem key={coin.coinId} value={coin.coinId} disabled={coin.coinId === toCoin}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{coin.symbol}</span>
                        <span className="text-muted-foreground text-xs">{coin.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="0.00"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                className="flex-1 font-mono text-lg"
                min="0"
                step="any"
              />
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full h-10 w-10 border-2"
              onClick={swapCoins}
            >
              <ArrowDownUp className="h-4 w-4" />
            </Button>
          </div>

          {/* To */}
          <div className="space-y-2">
            <Label>To</Label>
            <div className="flex gap-2">
              <Select value={toCoin} onValueChange={setToCoin}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_COINS.map(coin => (
                    <SelectItem key={coin.coinId} value={coin.coinId} disabled={coin.coinId === fromCoin}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{coin.symbol}</span>
                        <span className="text-muted-foreground text-xs">{coin.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex-1 flex items-center px-3 bg-muted rounded-md">
                {isLoadingQuote ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Getting quote...</span>
                  </div>
                ) : quote ? (
                  <span className="font-mono text-lg">{quote.toAmount}</span>
                ) : (
                  <span className="text-muted-foreground font-mono">0.00</span>
                )}
              </div>
            </div>
          </div>

          {/* Quote Details */}
          {quote && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Exchange Rate</span>
                <span className="font-mono">1 {fromCoin} = {quote.rate} {toCoin}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fee</span>
                <span className="font-mono">{quote.fee} {fromCoin}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">You Receive</span>
                <span className="font-mono font-bold text-primary">{quote.toAmount} {toCoin}</span>
              </div>
              {quoteExpiry > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-500">
                  <Clock className="h-4 w-4" />
                  <span>Quote expires in {quoteExpiry}s</span>
                </div>
              )}
              {quote.simulated && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3" />
                  <span>Estimated rate (live rates unavailable)</span>
                </div>
              )}
            </div>
          )}

          {/* Swap Button */}
          <Button
            className="w-full h-12 text-lg"
            disabled={!quote || isSwapping || quoteExpiry <= 0}
            onClick={executeSwap}
          >
            {isSwapping ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Swapping...
              </>
            ) : (
              <>
                <ArrowDownUp className="h-5 w-5 mr-2" />
                Swap Now
              </>
            )}
          </Button>

          {/* Refresh Quote */}
          {quote && quoteExpiry <= 0 && (
            <Button variant="outline" className="w-full" onClick={fetchQuote}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Quote
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Recent Swaps */}
      {swapHistory?.swaps?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Recent Swaps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {swapHistory.swaps.slice(0, 5).map((swap: any) => (
                <div
                  key={swap.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{swap.from_amount} {swap.from_coin_id}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono font-medium">{swap.to_amount || "..."} {swap.to_coin_id}</span>
                    </div>
                  </div>
                  <Badge
                    variant={swap.status === "completed" ? "default" : swap.status === "pending" ? "secondary" : "destructive"}
                  >
                    {swap.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {swap.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                    {swap.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">About Crypto Swaps</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>Swaps are processed instantly on supported networks</li>
                <li>Rates are locked for 60 seconds after quote</li>
                <li>A small network fee applies to each swap</li>
                <li>Minimum swap amount varies by cryptocurrency</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

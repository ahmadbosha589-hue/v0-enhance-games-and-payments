"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { 
  ArrowDownUp, 
  RefreshCw, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Coins,
  ArrowRight,
  Zap,
  Shield,
  History,
  Settings,
  ChevronDown,
  Star,
  Sparkles,
  BarChart3,
  Info
} from "lucide-react"
import { toast } from "sonner"
import useSWR from "swr"
import { cn } from "@/lib/utils"

interface Coin {
  coinId: string
  symbol: string
  name: string
  price?: number
  change24h?: number
  volume24h?: string
  marketCap?: string
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
  priceImpact?: number
}

interface SwapHistory {
  id: string
  from_coin_id: string
  to_coin_id: string
  from_amount: string
  to_amount: string
  rate: string
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

// Coin icon colors
const COIN_STYLES: Record<string, { color: string; bgColor: string; gradient: string }> = {
  BTC: { color: "text-orange-500", bgColor: "bg-orange-500/10", gradient: "from-orange-500 to-amber-500" },
  ETH: { color: "text-blue-500", bgColor: "bg-blue-500/10", gradient: "from-blue-500 to-indigo-500" },
  USDT: { color: "text-green-500", bgColor: "bg-green-500/10", gradient: "from-green-500 to-emerald-500" },
  USDC: { color: "text-blue-400", bgColor: "bg-blue-400/10", gradient: "from-blue-400 to-cyan-500" },
  LTC: { color: "text-gray-400", bgColor: "bg-gray-400/10", gradient: "from-gray-400 to-slate-500" },
  BNB: { color: "text-yellow-500", bgColor: "bg-yellow-500/10", gradient: "from-yellow-500 to-amber-400" },
  XRP: { color: "text-slate-400", bgColor: "bg-slate-400/10", gradient: "from-slate-400 to-gray-500" },
  DOGE: { color: "text-amber-500", bgColor: "bg-amber-500/10", gradient: "from-amber-500 to-yellow-500" },
  SOL: { color: "text-purple-500", bgColor: "bg-purple-500/10", gradient: "from-purple-500 to-violet-500" },
  TRX: { color: "text-red-500", bgColor: "bg-red-500/10", gradient: "from-red-500 to-rose-500" },
  MATIC: { color: "text-violet-500", bgColor: "bg-violet-500/10", gradient: "from-violet-500 to-purple-500" },
  ADA: { color: "text-cyan-500", bgColor: "bg-cyan-500/10", gradient: "from-cyan-500 to-blue-500" },
  AVAX: { color: "text-red-400", bgColor: "bg-red-400/10", gradient: "from-red-400 to-rose-500" },
  DOT: { color: "text-pink-500", bgColor: "bg-pink-500/10", gradient: "from-pink-500 to-rose-500" },
  LINK: { color: "text-blue-600", bgColor: "bg-blue-600/10", gradient: "from-blue-600 to-indigo-600" },
  ATOM: { color: "text-purple-400", bgColor: "bg-purple-400/10", gradient: "from-purple-400 to-indigo-500" },
}

// Default supported coins (will be updated with real prices)
const DEFAULT_COINS: Coin[] = [
  { coinId: "BTC", symbol: "BTC", name: "Bitcoin" },
  { coinId: "ETH", symbol: "ETH", name: "Ethereum" },
  { coinId: "USDT", symbol: "USDT", name: "Tether" },
  { coinId: "USDC", symbol: "USDC", name: "USD Coin" },
  { coinId: "BNB", symbol: "BNB", name: "BNB" },
  { coinId: "SOL", symbol: "SOL", name: "Solana" },
  { coinId: "XRP", symbol: "XRP", name: "Ripple" },
  { coinId: "DOGE", symbol: "DOGE", name: "Dogecoin" },
  { coinId: "ADA", symbol: "ADA", name: "Cardano" },
  { coinId: "AVAX", symbol: "AVAX", name: "Avalanche" },
  { coinId: "LTC", symbol: "LTC", name: "Litecoin" },
  { coinId: "LINK", symbol: "LINK", name: "Chainlink" },
  { coinId: "DOT", symbol: "DOT", name: "Polkadot" },
  { coinId: "MATIC", symbol: "MATIC", name: "Polygon" },
  { coinId: "TRX", symbol: "TRX", name: "Tron" },
  { coinId: "ATOM", symbol: "ATOM", name: "Cosmos" },
]

// Popular trading pairs for quick access
const POPULAR_PAIRS = [
  { from: "BTC", to: "USDT" },
  { from: "ETH", to: "USDT" },
  { from: "BTC", to: "ETH" },
  { from: "SOL", to: "USDT" },
  { from: "BNB", to: "USDT" },
  { from: "DOGE", to: "USDT" },
]

export function CryptoSwap() {
  const [fromCoin, setFromCoin] = useState<string>("BTC")
  const [toCoin, setToCoin] = useState<string>("USDT")
  const [fromAmount, setFromAmount] = useState<string>("")
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [isLoadingQuote, setIsLoadingQuote] = useState(false)
  const [isSwapping, setIsSwapping] = useState(false)
  const [quoteExpiry, setQuoteExpiry] = useState<number>(0)
  const [activeTab, setActiveTab] = useState("swap")
  const [searchCoin, setSearchCoin] = useState("")
  const [slippage, setSlippage] = useState("0.5")
  const [showSettings, setShowSettings] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(["BTC", "ETH", "USDT", "SOL"])

  const { data: swapHistory, mutate: refreshHistory } = useSWR("/api/ccpayment/swap", fetcher, {
    refreshInterval: 30000
  })

  // Fetch real crypto prices from API
  const { data: pricesData, mutate: refreshPrices } = useSWR<{ prices: Record<string, CryptoPrice> }>(
    "/api/crypto/prices",
    fetcher,
    { refreshInterval: 60000 } // Refresh every 60 seconds
  )

  // Merge real prices into coins
  const SUPPORTED_COINS = useMemo(() => {
    return DEFAULT_COINS.map(coin => {
      const priceData = pricesData?.prices?.[coin.symbol]
      if (priceData) {
        return {
          ...coin,
          price: priceData.price,
          change24h: priceData.change24h,
          volume24h: priceData.volume24h,
          marketCap: priceData.marketCap,
        }
      }
      return coin
    })
  }, [pricesData])

  const filteredCoins = useMemo(() => {
    if (!searchCoin) return SUPPORTED_COINS
    const search = searchCoin.toLowerCase()
    return SUPPORTED_COINS.filter(c => 
      c.symbol.toLowerCase().includes(search) || 
      c.name.toLowerCase().includes(search)
    )
  }, [searchCoin, SUPPORTED_COINS])

  const fromCoinData = SUPPORTED_COINS.find(c => c.coinId === fromCoin)
  const toCoinData = SUPPORTED_COINS.find(c => c.coinId === toCoin)

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
        // Calculate price impact
        const priceImpact = parseFloat(fromAmount) > 10000 ? 0.1 : 
                          parseFloat(fromAmount) > 1000 ? 0.05 : 0.01
        setQuote({ ...data.quote, priceImpact })
        setQuoteExpiry(Math.floor((data.quote.validUntil - Date.now()) / 1000))
      } else {
        toast.error(data.error || "Failed to get quote")
        setQuote(null)
      }
    } catch {
      // Generate simulated quote if API fails
      const fromPrice = fromCoinData?.price || 1
      const toPrice = toCoinData?.price || 1
      const rate = fromPrice / toPrice
      const toAmount = (parseFloat(fromAmount) * rate * 0.995).toFixed(8) // 0.5% fee
      
      setQuote({
        fromCoinId: fromCoin,
        toCoinId: toCoin,
        fromAmount,
        toAmount,
        rate: rate.toFixed(8),
        fee: (parseFloat(fromAmount) * 0.005).toFixed(8),
        validUntil: Date.now() + 60000,
        simulated: true,
        priceImpact: 0.02
      })
      setQuoteExpiry(60)
    } finally {
      setIsLoadingQuote(false)
    }
  }, [fromAmount, fromCoin, toCoin, fromCoinData, toCoinData])

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

  const selectPair = (from: string, to: string) => {
    setFromCoin(from)
    setToCoin(to)
    setFromAmount("")
    setQuote(null)
  }

  const toggleFavorite = (coinId: string) => {
    setFavorites(prev => 
      prev.includes(coinId) 
        ? prev.filter(c => c !== coinId)
        : [...prev, coinId]
    )
  }

  const executeSwap = async () => {
    if (!quote || !fromAmount) return

    setIsSwapping(true)
    setShowConfirmDialog(false)
    
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
          description: `Swapping ${fromAmount} ${fromCoin} to ${quote.toAmount} ${toCoin}`
        })
        setFromAmount("")
        setQuote(null)
        refreshHistory()
      } else {
        toast.error(data.error || "Swap failed")
      }
    } catch {
      toast.error("Failed to execute swap")
    } finally {
      setIsSwapping(false)
    }
  }

  const history: SwapHistory[] = swapHistory?.swaps || []

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="swap" className="gap-2">
              <ArrowDownUp className="h-4 w-4" />
              Swap
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="market" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Market
            </TabsTrigger>
          </TabsList>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Swap Tab */}
        <TabsContent value="swap" className="space-y-6 mt-0">
          {/* Popular Pairs */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground self-center">Popular:</span>
            {POPULAR_PAIRS.map((pair, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className={cn(
                  "gap-1 h-8",
                  fromCoin === pair.from && toCoin === pair.to && "border-primary bg-primary/5"
                )}
                onClick={() => selectPair(pair.from, pair.to)}
              >
                <span className={COIN_STYLES[pair.from]?.color}>{pair.from}</span>
                <ArrowRight className="h-3 w-3" />
                <span className={COIN_STYLES[pair.to]?.color}>{pair.to}</span>
              </Button>
            ))}
          </div>

          {/* Swap Card */}
          <Card className="border-primary/20">
            <CardContent className="p-6 space-y-6">
              {/* From */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>From</Label>
                  {fromCoinData && (
                    <span className="text-xs text-muted-foreground">
                      Price: ${fromCoinData.price?.toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Select value={fromCoin} onValueChange={setFromCoin}>
                    <SelectTrigger className="w-[160px] h-12">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                            `bg-gradient-to-br ${COIN_STYLES[fromCoin]?.gradient || "from-gray-500 to-gray-600"}`
                          )}>
                            {fromCoin.slice(0, 2)}
                          </div>
                          <span className="font-medium">{fromCoin}</span>
                        </div>
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
                      {favorites.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-yellow-500" />
                            Favorites
                          </SelectLabel>
                          {SUPPORTED_COINS.filter(c => favorites.includes(c.coinId)).map(coin => (
                            <SelectItem key={coin.coinId} value={coin.coinId} disabled={coin.coinId === toCoin}>
                              <div className="flex items-center justify-between w-full gap-2">
                                <div className="flex items-center gap-2">
                                  <div className={cn(
                                    "w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white",
                                    `bg-gradient-to-br ${COIN_STYLES[coin.symbol]?.gradient || "from-gray-500 to-gray-600"}`
                                  )}>
                                    {coin.symbol.slice(0, 2)}
                                  </div>
                                  <span>{coin.symbol}</span>
                                </div>
                                {coin.change24h !== undefined && (
                                  <span className={cn(
                                    "text-xs",
                                    coin.change24h >= 0 ? "text-green-500" : "text-red-500"
                                  )}>
                                    {coin.change24h >= 0 ? "+" : ""}{coin.change24h}%
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      <SelectGroup>
                        <SelectLabel>All Coins</SelectLabel>
                        {filteredCoins.map(coin => (
                          <SelectItem key={coin.coinId} value={coin.coinId} disabled={coin.coinId === toCoin}>
                            <div className="flex items-center justify-between w-full gap-2">
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white",
                                  `bg-gradient-to-br ${COIN_STYLES[coin.symbol]?.gradient || "from-gray-500 to-gray-600"}`
                                )}>
                                  {coin.symbol.slice(0, 2)}
                                </div>
                                <span>{coin.symbol}</span>
                                <span className="text-xs text-muted-foreground">{coin.name}</span>
                              </div>
                              {coin.change24h !== undefined && (
                                <span className={cn(
                                  "text-xs",
                                  coin.change24h >= 0 ? "text-green-500" : "text-red-500"
                                )}>
                                  {coin.change24h >= 0 ? "+" : ""}{coin.change24h}%
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={fromAmount}
                    onChange={(e) => setFromAmount(e.target.value)}
                    className="flex-1 font-mono text-lg h-12"
                    min="0"
                    step="any"
                  />
                </div>
                {fromAmount && fromCoinData?.price && (
                  <p className="text-xs text-muted-foreground text-right">
                    ≈ ${(parseFloat(fromAmount) * fromCoinData.price).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Swap Button */}
              <div className="flex justify-center relative">
                <div className="absolute inset-x-0 top-1/2 border-t" />
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full h-12 w-12 border-2 bg-background z-10 hover:rotate-180 transition-transform duration-300"
                  onClick={swapCoins}
                >
                  <ArrowDownUp className="h-5 w-5" />
                </Button>
              </div>

              {/* To */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>To</Label>
                  {toCoinData && (
                    <span className="text-xs text-muted-foreground">
                      Price: ${toCoinData.price?.toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Select value={toCoin} onValueChange={setToCoin}>
                    <SelectTrigger className="w-[160px] h-12">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                            `bg-gradient-to-br ${COIN_STYLES[toCoin]?.gradient || "from-gray-500 to-gray-600"}`
                          )}>
                            {toCoin.slice(0, 2)}
                          </div>
                          <span className="font-medium">{toCoin}</span>
                        </div>
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
                        <SelectLabel>All Coins</SelectLabel>
                        {filteredCoins.map(coin => (
                          <SelectItem key={coin.coinId} value={coin.coinId} disabled={coin.coinId === fromCoin}>
                            <div className="flex items-center justify-between w-full gap-2">
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white",
                                  `bg-gradient-to-br ${COIN_STYLES[coin.symbol]?.gradient || "from-gray-500 to-gray-600"}`
                                )}>
                                  {coin.symbol.slice(0, 2)}
                                </div>
                                <span>{coin.symbol}</span>
                                <span className="text-xs text-muted-foreground">{coin.name}</span>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <div className="flex-1 flex items-center px-4 bg-muted rounded-md h-12">
                    {isLoadingQuote ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Getting best rate...</span>
                      </div>
                    ) : quote ? (
                      <span className="font-mono text-lg">{parseFloat(quote.toAmount).toFixed(8)}</span>
                    ) : (
                      <span className="text-muted-foreground font-mono">0.00</span>
                    )}
                  </div>
                </div>
                {quote && toCoinData?.price && (
                  <p className="text-xs text-muted-foreground text-right">
                    ≈ ${(parseFloat(quote.toAmount) * toCoinData.price).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Quote Details */}
              {quote && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Exchange Rate</span>
                    <span className="font-mono">1 {fromCoin} = {parseFloat(quote.rate).toFixed(6)} {toCoin}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fee (0.5%)</span>
                    <span className="font-mono">{parseFloat(quote.fee).toFixed(8)} {fromCoin}</span>
                  </div>
                  {quote.priceImpact !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Price Impact</span>
                      <span className={cn(
                        "font-mono",
                        quote.priceImpact > 1 ? "text-red-500" : 
                        quote.priceImpact > 0.5 ? "text-amber-500" : "text-green-500"
                      )}>
                        {quote.priceImpact.toFixed(2)}%
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">You Receive</span>
                    <span className="font-mono font-bold text-primary">
                      {parseFloat(quote.toAmount).toFixed(8)} {toCoin}
                    </span>
                  </div>
                  {quoteExpiry > 0 && (
                    <div className="flex items-center justify-between text-sm pt-2 border-t">
                      <div className="flex items-center gap-2 text-amber-500">
                        <Clock className="h-4 w-4" />
                        <span>Quote expires in {quoteExpiry}s</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={fetchQuote}
                        className="h-7 gap-1"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Refresh
                      </Button>
                    </div>
                  )}
                  {quote.simulated && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                      <Info className="h-3 w-3" />
                      <span>Estimated rate (live rates temporarily unavailable)</span>
                    </div>
                  )}
                </div>
              )}

              {/* Swap Button */}
              <Button
                className="w-full h-14 text-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700"
                disabled={!quote || isSwapping || quoteExpiry <= 0}
                onClick={() => setShowConfirmDialog(true)}
              >
                {isSwapping ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Swapping...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5 mr-2" />
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

          {/* Info Card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Secure Swaps via CCPayment</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>Best rates across multiple liquidity providers</li>
                    <li>Swaps processed instantly on supported networks</li>
                    <li>No hidden fees - only 0.5% swap fee</li>
                    <li>16+ supported cryptocurrencies</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-0">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <History className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No swap history yet</p>
                    <p className="text-sm text-muted-foreground">Your swaps will appear here</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {history.map((swap) => (
                      <div
                        key={swap.id}
                        className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white",
                              `bg-gradient-to-br ${COIN_STYLES[swap.from_coin_id]?.gradient || "from-gray-500 to-gray-600"}`
                            )}>
                              {swap.from_coin_id.slice(0, 2)}
                            </div>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white",
                              `bg-gradient-to-br ${COIN_STYLES[swap.to_coin_id]?.gradient || "from-gray-500 to-gray-600"}`
                            )}>
                              {swap.to_coin_id.slice(0, 2)}
                            </div>
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {parseFloat(swap.from_amount).toFixed(6)} {swap.from_coin_id} 
                              <span className="text-muted-foreground mx-1">→</span>
                              {swap.to_amount ? parseFloat(swap.to_amount).toFixed(6) : "..."} {swap.to_coin_id}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(swap.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={swap.status === "completed" ? "default" : 
                                  swap.status === "pending" ? "secondary" : "destructive"}
                          className="gap-1"
                        >
                          {swap.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
                          {swap.status === "pending" && <Clock className="h-3 w-3" />}
                          {swap.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Market Tab */}
        <TabsContent value="market" className="mt-0">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="divide-y">
                  {SUPPORTED_COINS.map((coin) => (
                    <div
                      key={coin.coinId}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        setFromCoin(coin.coinId)
                        setActiveTab("swap")
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white",
                          `bg-gradient-to-br ${COIN_STYLES[coin.symbol]?.gradient || "from-gray-500 to-gray-600"}`
                        )}>
                          {coin.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium">{coin.name}</p>
                          <p className="text-sm text-muted-foreground">{coin.symbol}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${coin.price?.toLocaleString()}</p>
                        <p className={cn(
                          "text-sm flex items-center justify-end gap-1",
                          (coin.change24h || 0) >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          {(coin.change24h || 0) >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {Math.abs(coin.change24h || 0)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Swap Settings</DialogTitle>
            <DialogDescription>Configure your swap preferences</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Slippage Tolerance</Label>
              <div className="flex gap-2">
                {["0.1", "0.5", "1.0", "3.0"].map((val) => (
                  <Button
                    key={val}
                    variant={slippage === val ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSlippage(val)}
                  >
                    {val}%
                  </Button>
                ))}
                <Input
                  type="number"
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                  className="w-20"
                  min="0.1"
                  max="50"
                  step="0.1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Higher slippage increases chances of successful swap but may result in worse rates
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Confirm Swap
            </DialogTitle>
            <DialogDescription>Review your swap details</DialogDescription>
          </DialogHeader>
          {quote && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">From</p>
                  <p className="text-xl font-bold">{fromAmount}</p>
                  <p className={COIN_STYLES[fromCoin]?.color}>{fromCoin}</p>
                </div>
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">To</p>
                  <p className="text-xl font-bold text-primary">{parseFloat(quote.toAmount).toFixed(6)}</p>
                  <p className={COIN_STYLES[toCoin]?.color}>{toCoin}</p>
                </div>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-mono">1 {fromCoin} = {parseFloat(quote.rate).toFixed(6)} {toCoin}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-mono">{parseFloat(quote.fee).toFixed(8)} {fromCoin}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Slippage</span>
                  <span className="font-mono">{slippage}%</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowConfirmDialog(false)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600"
                  onClick={executeSwap}
                  disabled={isSwapping}
                >
                  {isSwapping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Confirm Swap"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

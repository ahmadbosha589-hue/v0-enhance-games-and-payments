import { NextResponse } from "next/server"

// CoinGecko API coin IDs mapping - includes ALL FaucetPay supported cryptos
// IMPORTANT: Keep this list synchronized with manual faucet supported coins
const COINGECKO_IDS: Record<string, string> = {
  // Major cryptocurrencies
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  DOGE: "dogecoin",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LTC: "litecoin",
  LINK: "chainlink",
  DOT: "polkadot",
  MATIC: "matic-network",
  TRX: "tron",
  ATOM: "cosmos",
  SHIB: "shiba-inu",
  UNI: "uniswap",
  XLM: "stellar",
  ETC: "ethereum-classic",
  // FaucetPay supported coins - CRITICAL for faucet functionality
  FEY: "feyorra",
  ZEC: "zcash",
  BCH: "bitcoin-cash",
  DASH: "dash",
  DGB: "digibyte",
  TON: "the-open-network",
}

// Reverse mapping for faster lookups
const GECKO_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(COINGECKO_IDS).map(([symbol, geckoId]) => [geckoId, symbol])
)

interface CoinGeckoPrice {
  usd: number
  usd_24h_change?: number
  usd_24h_vol?: number
  usd_market_cap?: number
}

interface CryptoPrice {
  symbol: string
  name: string
  price: number
  change24h: number
  volume24h: string
  marketCap: string
  lastUpdated: number
}

// Cache prices for 60 seconds
let cachedPrices: Record<string, CryptoPrice> = {}
let lastFetchTime = 0
const CACHE_DURATION = 60 * 1000 // 60 seconds

// Fetch prices from CoinGecko with proper error handling and timeout
async function fetchFromCoinGecko(): Promise<Record<string, CryptoPrice>> {
  const coinIds = Object.values(COINGECKO_IDS).join(",")

  // Use AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
      {
        headers: {
          "Accept": "application/json",
          "User-Agent": "CryptoFaucet/1.0",
        },
        signal: controller.signal,
        next: { revalidate: 60 }, // Cache for 60 seconds
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      // Handle rate limiting gracefully
      if (response.status === 429) {
        console.warn("CoinGecko rate limited; no fresh market data is available")
        throw new Error("Rate limited")
      }
      throw new Error(`CoinGecko API error: ${response.status}`)
    }

    const data: Record<string, CoinGeckoPrice> = await response.json()

    // Validate we got actual data
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      throw new Error("Empty response from CoinGecko")
    }

    const prices: Record<string, CryptoPrice> = {}
    const now = Date.now()

    for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
      const priceData = data[geckoId]
      if (priceData && typeof priceData.usd === 'number' && priceData.usd > 0) {
        prices[symbol] = {
          symbol,
          name: getFullName(symbol),
          price: priceData.usd,
          change24h: priceData.usd_24h_change || 0,
          volume24h: formatLargeNumber(priceData.usd_24h_vol || 0),
          marketCap: formatLargeNumber(priceData.usd_market_cap || 0),
          lastUpdated: now,
        }
      } else {
        // Omit coins absent from the live response; never synthesize a market price.
      }
    }

    return prices
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

function getFullName(symbol: string): string {
  const names: Record<string, string> = {
    BTC: "Bitcoin",
    ETH: "Ethereum",
    USDT: "Tether",
    USDC: "USD Coin",
    BNB: "BNB",
    SOL: "Solana",
    XRP: "Ripple",
    DOGE: "Dogecoin",
    ADA: "Cardano",
    AVAX: "Avalanche",
    LTC: "Litecoin",
    LINK: "Chainlink",
    DOT: "Polkadot",
    MATIC: "Polygon",
    TRX: "Tron",
    ATOM: "Cosmos",
    SHIB: "Shiba Inu",
    UNI: "Uniswap",
    XLM: "Stellar",
    ETC: "Ethereum Classic",
    // FaucetPay supported coins
    FEY: "Feyorra",
    ZEC: "Zcash",
    BCH: "Bitcoin Cash",
    DASH: "Dash",
    DGB: "DigiByte",
    TON: "Toncoin",
  }
  return names[symbol] || symbol
}

function formatLargeNumber(num: number): string {
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`
  return num.toFixed(2)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbols = searchParams.get("symbols")?.split(",") || Object.keys(COINGECKO_IDS)

    // Check if cache is valid
    const now = Date.now()
    if (now - lastFetchTime < CACHE_DURATION && Object.keys(cachedPrices).length > 0) {
      // Return cached prices
      const filtered = symbols.reduce((acc, sym) => {
        if (cachedPrices[sym]) acc[sym] = cachedPrices[sym]
        return acc
      }, {} as Record<string, CryptoPrice>)

      return NextResponse.json({
        prices: filtered,
        cached: true,
        lastUpdated: lastFetchTime
      })
    }

    // Fetch fresh prices
    try {
      cachedPrices = await fetchFromCoinGecko()
      lastFetchTime = now
    } catch (error) {
      console.error("Failed to fetch from CoinGecko:", error)
      if (Object.keys(cachedPrices).length > 0) {
        const filtered = symbols.reduce((acc, sym) => {
          if (cachedPrices[sym]) acc[sym] = cachedPrices[sym]
          return acc
        }, {} as Record<string, CryptoPrice>)
        return NextResponse.json({
          prices: filtered,
          cached: true,
          stale: true,
          lastUpdated: lastFetchTime,
          error: "Live price provider unavailable; showing cached data",
        })
      }
      return NextResponse.json({
        prices: {},
        cached: false,
        lastUpdated: null,
        error: "Live price provider unavailable",
      }, { status: 503 })
    }

    const filtered = symbols.reduce((acc, sym) => {
      if (cachedPrices[sym]) acc[sym] = cachedPrices[sym]
      return acc
    }, {} as Record<string, CryptoPrice>)

    return NextResponse.json({
      prices: filtered,
      cached: false,
      lastUpdated: lastFetchTime
    })
  } catch (error) {
    console.error("Crypto prices API error:", error)
    return NextResponse.json({
      prices: {},
      cached: false,
      lastUpdated: null,
      error: "Live price provider unavailable",
    }, { status: 503 })
  }
}

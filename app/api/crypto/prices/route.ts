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
        console.warn("CoinGecko rate limited, using cached/fallback prices")
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
        // Use fallback for missing coins
        const fallback = getFallbackPrices()[symbol]
        if (fallback) {
          prices[symbol] = { ...fallback, lastUpdated: now }
        }
      }
    }

    // Ensure all FaucetPay coins have prices
    const faucetPayCoins = ["LTC", "ETH", "DOGE", "TRX", "FEY", "ZEC", "BCH", "DASH", "DGB", "SOL", "BNB", "MATIC", "USDT"]
    const fallbackPrices = getFallbackPrices()

    for (const coin of faucetPayCoins) {
      if (!prices[coin] || prices[coin].price <= 0) {
        if (fallbackPrices[coin]) {
          prices[coin] = { ...fallbackPrices[coin], lastUpdated: now }
        }
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

// Fallback prices if API fails - includes ALL FaucetPay supported cryptos
function getFallbackPrices(): Record<string, CryptoPrice> {
  const fallback: Record<string, CryptoPrice> = {
    BTC: { symbol: "BTC", name: "Bitcoin", price: 97000, change24h: 2.5, volume24h: "28B", marketCap: "1.9T", lastUpdated: Date.now() },
    ETH: { symbol: "ETH", name: "Ethereum", price: 3500, change24h: 3.2, volume24h: "15B", marketCap: "420B", lastUpdated: Date.now() },
    USDT: { symbol: "USDT", name: "Tether", price: 1, change24h: 0.01, volume24h: "45B", marketCap: "95B", lastUpdated: Date.now() },
    USDC: { symbol: "USDC", name: "USD Coin", price: 1, change24h: 0.0, volume24h: "5B", marketCap: "32B", lastUpdated: Date.now() },
    BNB: { symbol: "BNB", name: "BNB", price: 700, change24h: -0.5, volume24h: "2B", marketCap: "107B", lastUpdated: Date.now() },
    SOL: { symbol: "SOL", name: "Solana", price: 190, change24h: 6.8, volume24h: "3B", marketCap: "92B", lastUpdated: Date.now() },
    XRP: { symbol: "XRP", name: "Ripple", price: 2.3, change24h: 4.1, volume24h: "8B", marketCap: "130B", lastUpdated: Date.now() },
    DOGE: { symbol: "DOGE", name: "Dogecoin", price: 0.38, change24h: 5.2, volume24h: "5B", marketCap: "56B", lastUpdated: Date.now() },
    ADA: { symbol: "ADA", name: "Cardano", price: 1.05, change24h: 3.3, volume24h: "2B", marketCap: "37B", lastUpdated: Date.now() },
    AVAX: { symbol: "AVAX", name: "Avalanche", price: 42, change24h: 4.5, volume24h: "600M", marketCap: "17B", lastUpdated: Date.now() },
    LTC: { symbol: "LTC", name: "Litecoin", price: 115, change24h: 1.8, volume24h: "800M", marketCap: "8.6B", lastUpdated: Date.now() },
    LINK: { symbol: "LINK", name: "Chainlink", price: 23, change24h: 2.1, volume24h: "600M", marketCap: "14B", lastUpdated: Date.now() },
    DOT: { symbol: "DOT", name: "Polkadot", price: 8.5, change24h: 1.5, volume24h: "400M", marketCap: "13B", lastUpdated: Date.now() },
    MATIC: { symbol: "MATIC", name: "Polygon", price: 0.55, change24h: 2.1, volume24h: "400M", marketCap: "5.5B", lastUpdated: Date.now() },
    TRX: { symbol: "TRX", name: "Tron", price: 0.26, change24h: 1.2, volume24h: "600M", marketCap: "22B", lastUpdated: Date.now() },
    ATOM: { symbol: "ATOM", name: "Cosmos", price: 9.5, change24h: 3.0, volume24h: "200M", marketCap: "3.7B", lastUpdated: Date.now() },
    // FaucetPay supported coins that were missing
    FEY: { symbol: "FEY", name: "Feyorra", price: 0.00008, change24h: 0.5, volume24h: "50K", marketCap: "800K", lastUpdated: Date.now() },
    ZEC: { symbol: "ZEC", name: "Zcash", price: 45, change24h: 2.3, volume24h: "150M", marketCap: "750M", lastUpdated: Date.now() },
    BCH: { symbol: "BCH", name: "Bitcoin Cash", price: 480, change24h: 1.8, volume24h: "500M", marketCap: "9.5B", lastUpdated: Date.now() },
    DASH: { symbol: "DASH", name: "Dash", price: 32, change24h: 1.5, volume24h: "100M", marketCap: "370M", lastUpdated: Date.now() },
    DGB: { symbol: "DGB", name: "DigiByte", price: 0.015, change24h: 2.0, volume24h: "20M", marketCap: "260M", lastUpdated: Date.now() },
    TON: { symbol: "TON", name: "Toncoin", price: 5.5, change24h: 3.5, volume24h: "200M", marketCap: "14B", lastUpdated: Date.now() },
  }
  return fallback
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
      // Use fallback if API fails and no cache
      if (Object.keys(cachedPrices).length === 0) {
        cachedPrices = getFallbackPrices()
        lastFetchTime = now
      }
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
      prices: getFallbackPrices(),
      cached: false,
      lastUpdated: Date.now(),
      error: "Using fallback prices"
    })
  }
}

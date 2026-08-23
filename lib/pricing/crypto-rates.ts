import { NextResponse } from "next/server"

/**
 * Server-side USD → satoshi conversion at live market rates.
 *
 * Single source of truth for converting the platform's USD-priced products
 * (boosters, advertising deposits, etc.) into BTC amounts. Prices come from
 * CoinGecko with a 60-second cache; NO synthetic/fallback price exists — if
 * the live rate is unavailable, callers must refuse the transaction rather
 * than guess.
 */

const CACHE_TTL_MS = 60 * 1000

interface PriceEntry {
  usd: number
  fetchedAt: number
}

let cache: { btc?: PriceEntry } = {}

async function fetchBtcUsd(): Promise<number> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
        // Next.js data cache — dedupes concurrent requests within a minute.
        next: { revalidate: 60 },
      },
    )
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`CoinGecko returned ${response.status}`)
    }

    const data = (await response.json()) as { bitcoin?: { usd?: number } }
    const usd = data?.bitcoin?.usd

    if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
      throw new Error("CoinGecko response missing valid bitcoin.usd")
    }
    return usd
  } catch (err) {
    clearTimeout(timeoutId)
    throw err
  }
}

/** Live BTC/USD rate. Throws when no fresh rate can be obtained. */
export async function getBtcUsdRate(): Promise<number> {
  const cached = cache.btc
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.usd
  }

  void cached
  const usd = await fetchBtcUsd()
  cache.btc = { usd, fetchedAt: Date.now() }
  return usd
}

export interface UsdToSatsResult {
  /** Live rate used for this conversion. */
  btcUsd: number
  /** Exact satoshi amount (rounded down — never overcharge). */
  satoshis: number
  /** Human display string, e.g. "6,567 sats". */
  satoshisDisplay: string
  /** When the underlying rate was fetched. */
  rateFetchedAt: string
}

/**
 * Convert a USD price to satoshis at the live BTC/USD rate.
 * Rounds DOWN to whole sats so the platform never overcharges by rounding.
 */
export async function usdToSatoshis(usdAmount: number): Promise<UsdToSatsResult> {
  const btcUsd = await getBtcUsdRate()
  const satoshis = Math.floor((usdAmount / btcUsd) * 100_000_000)
  return {
    btcUsd,
    satoshis,
    satoshisDisplay: `${satoshis.toLocaleString()} sats`,
    rateFetchedAt: new Date().toISOString(),
  }
}

export function usdToSatoshisSync(usdAmount: number, btcUsd: number): number {
  return Math.floor((usdAmount / btcUsd) * 100_000_000)
}

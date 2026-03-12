"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

// CoinGecko API coin IDs mapping - for fetching real crypto images
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  LTC: "litecoin",
  ETH: "ethereum",
  DOGE: "dogecoin",
  TRX: "tron",
  FEY: "feyorra",
  ZEC: "zcash",
  BCH: "bitcoin-cash",
  DASH: "dash",
  DGB: "digibyte",
  SOL: "solana",
  BNB: "binancecoin",
  MATIC: "matic-network",
  USDT: "tether",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  DOT: "polkadot",
  ATOM: "cosmos",
  SHIB: "shiba-inu",
  XLM: "stellar",
  USDC: "usd-coin",
}

// Use CoinGecko's direct image API - more reliable and higher quality
const CRYPTO_ICONS: Record<string, string> = {
  BTC: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  LTC: "https://assets.coingecko.com/coins/images/2/large/litecoin.png",
  ETH: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  DOGE: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
  TRX: "https://assets.coingecko.com/coins/images/1094/large/tron-logo.png",
  FEY: "https://assets.coingecko.com/coins/images/14543/large/feyorra.png",
  ZEC: "https://assets.coingecko.com/coins/images/486/large/circle-zcash-color.png",
  BCH: "https://assets.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png",
  DASH: "https://assets.coingecko.com/coins/images/19/large/dash-logo.png",
  DGB: "https://assets.coingecko.com/coins/images/63/large/digibyte.png",
  SOL: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  BNB: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  MATIC: "https://assets.coingecko.com/coins/images/4713/large/polygon.png",
  USDT: "https://assets.coingecko.com/coins/images/325/large/Tether.png",
  XRP: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
  ADA: "https://assets.coingecko.com/coins/images/975/large/cardano.png",
  AVAX: "https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
  LINK: "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
  DOT: "https://assets.coingecko.com/coins/images/12171/large/polkadot.png",
  ATOM: "https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png",
  SHIB: "https://assets.coingecko.com/coins/images/11939/large/shiba.png",
  XLM: "https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png",
  USDC: "https://assets.coingecko.com/coins/images/6319/large/usdc.png",
}

// Fallback background colors for coins that don't have icons (no gradients, solid colors)
const COIN_COLORS: Record<string, string> = {
  BTC: "bg-orange-500",
  LTC: "bg-slate-400",
  ETH: "bg-indigo-500",
  DOGE: "bg-amber-500",
  TRX: "bg-red-500",
  FEY: "bg-purple-500",
  ZEC: "bg-yellow-500",
  BCH: "bg-green-500",
  DASH: "bg-blue-500",
  DGB: "bg-blue-600",
  SOL: "bg-violet-500",
  BNB: "bg-yellow-500",
  MATIC: "bg-violet-600",
  USDT: "bg-emerald-500",
  XRP: "bg-gray-500",
  ADA: "bg-blue-500",
  AVAX: "bg-red-500",
  LINK: "bg-blue-600",
  DOT: "bg-pink-500",
  ATOM: "bg-purple-500",
  SHIB: "bg-orange-500",
  XLM: "bg-slate-600",
  USDC: "bg-blue-500",
}

// Export for external use - keeping old name for backward compatibility
const COIN_GRADIENTS = COIN_COLORS

interface CryptoIconProps {
  symbol: string
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  className?: string
  showFallback?: boolean
}

const sizes = {
  xs: { container: "h-4 w-4", icon: 16, text: "text-[6px]" },
  sm: { container: "h-6 w-6", icon: 24, text: "text-[8px]" },
  md: { container: "h-8 w-8", icon: 32, text: "text-[10px]" },
  lg: { container: "h-10 w-10", icon: 40, text: "text-xs" },
  xl: { container: "h-12 w-12", icon: 48, text: "text-sm" },
}

export function CryptoIcon({ symbol, size = "md", className, showFallback = true }: CryptoIconProps) {
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const upperSymbol = symbol?.toUpperCase() || "BTC"
  const iconUrl = CRYPTO_ICONS[upperSymbol]
  const coinColor = COIN_COLORS[upperSymbol] || "bg-gray-500"
  // Ensure we have a valid size - fallback to md if invalid
  const validSize = (typeof size === "string" && size in sizes) ? size as keyof typeof sizes : "md"
  const sizeConfig = sizes[validSize]

  // Show image if URL exists and hasn't errored
  if (iconUrl && !imageError) {
    return (
      <div className={cn("relative rounded-full overflow-hidden bg-muted flex items-center justify-center", sizeConfig.container, className)}>
        {!imageLoaded && (
          <div className={cn("absolute inset-0 animate-pulse", coinColor, "rounded-full")} />
        )}
        <Image
          src={iconUrl}
          alt={`${upperSymbol} logo`}
          width={sizeConfig.icon}
          height={sizeConfig.icon}
          className={cn("object-contain rounded-full", imageLoaded ? "opacity-100" : "opacity-0")}
          unoptimized
          onError={() => setImageError(true)}
          onLoad={() => setImageLoaded(true)}
        />
      </div>
    )
  }

  // Fallback to solid color circle with symbol initials (only when image fails)
  if (showFallback) {
    return (
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-bold text-white",
          sizeConfig.container,
          sizeConfig.text,
          coinColor,
          className
        )}
      >
        {upperSymbol.slice(0, 2)}
      </div>
    )
  }

  return null
}

// Export crypto icon map for external use
export { CRYPTO_ICONS, COIN_GRADIENTS }

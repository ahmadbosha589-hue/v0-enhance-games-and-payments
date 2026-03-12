"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

// Map of crypto symbols to their CoinGecko icon URLs
const CRYPTO_ICONS: Record<string, string> = {
  // Main coins
  BTC: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png",
  LTC: "https://assets.coingecko.com/coins/images/2/standard/litecoin.png",
  ETH: "https://assets.coingecko.com/coins/images/279/standard/ethereum.png",
  DOGE: "https://assets.coingecko.com/coins/images/5/standard/dogecoin.png",
  TRX: "https://assets.coingecko.com/coins/images/1094/standard/tron-logo.png",
  FEY: "https://assets.coingecko.com/coins/images/14543/standard/feyorra.png",
  ZEC: "https://assets.coingecko.com/coins/images/486/standard/zcash.png",
  BCH: "https://assets.coingecko.com/coins/images/780/standard/bitcoin-cash-circle.png",
  DASH: "https://assets.coingecko.com/coins/images/19/standard/dash-logo.png",
  DGB: "https://assets.coingecko.com/coins/images/63/standard/digibyte.png",
  SOL: "https://assets.coingecko.com/coins/images/4128/standard/solana.png",
  BNB: "https://assets.coingecko.com/coins/images/825/standard/bnb-icon2_2x.png",
  MATIC: "https://assets.coingecko.com/coins/images/4713/standard/polygon.png",
  USDT: "https://assets.coingecko.com/coins/images/325/standard/Tether.png",
  XRP: "https://assets.coingecko.com/coins/images/44/standard/xrp-symbol-white-128.png",
  ADA: "https://assets.coingecko.com/coins/images/975/standard/cardano.png",
  AVAX: "https://assets.coingecko.com/coins/images/12559/standard/Avalanche_Circle_RedWhite_Trans.png",
  LINK: "https://assets.coingecko.com/coins/images/877/standard/chainlink-new-logo.png",
  DOT: "https://assets.coingecko.com/coins/images/12171/standard/polkadot.png",
  ATOM: "https://assets.coingecko.com/coins/images/1481/standard/cosmos_hub.png",
  SHIB: "https://assets.coingecko.com/coins/images/11939/standard/shiba.png",
  XLM: "https://assets.coingecko.com/coins/images/100/standard/Stellar_symbol_black_RGB.png",
  USDC: "https://assets.coingecko.com/coins/images/6319/standard/usdc.png",
}

// Fallback gradient colors for coins that don't have icons
const COIN_GRADIENTS: Record<string, string> = {
  BTC: "from-orange-500 to-amber-500",
  LTC: "from-gray-400 to-slate-500",
  ETH: "from-blue-500 to-indigo-500",
  DOGE: "from-amber-500 to-yellow-500",
  TRX: "from-red-500 to-rose-500",
  FEY: "from-purple-500 to-violet-500",
  ZEC: "from-yellow-500 to-amber-600",
  BCH: "from-green-500 to-emerald-500",
  DASH: "from-blue-400 to-cyan-500",
  DGB: "from-blue-600 to-indigo-600",
  SOL: "from-purple-500 to-violet-500",
  BNB: "from-yellow-500 to-amber-400",
  MATIC: "from-violet-500 to-purple-500",
  USDT: "from-green-500 to-emerald-500",
  XRP: "from-slate-400 to-gray-500",
  ADA: "from-cyan-500 to-blue-500",
  AVAX: "from-red-400 to-rose-500",
  LINK: "from-blue-600 to-indigo-600",
  DOT: "from-pink-500 to-rose-500",
  ATOM: "from-purple-400 to-indigo-500",
  SHIB: "from-orange-500 to-red-500",
  XLM: "from-slate-500 to-gray-600",
  USDC: "from-blue-400 to-cyan-500",
}

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
  const upperSymbol = symbol.toUpperCase()
  const iconUrl = CRYPTO_ICONS[upperSymbol]
  const gradient = COIN_GRADIENTS[upperSymbol] || "from-gray-500 to-gray-600"
  const sizeConfig = sizes[size]

  if (iconUrl) {
    return (
      <div className={cn("relative rounded-full overflow-hidden bg-background", sizeConfig.container, className)}>
        <Image
          src={iconUrl}
          alt={`${upperSymbol} logo`}
          width={sizeConfig.icon}
          height={sizeConfig.icon}
          className="object-contain"
          unoptimized
        />
      </div>
    )
  }

  // Fallback to gradient circle with symbol initials
  if (showFallback) {
    return (
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br",
          sizeConfig.container,
          sizeConfig.text,
          gradient,
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

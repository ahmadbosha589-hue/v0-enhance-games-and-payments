"use client"

import Image from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"

// Map of crypto symbols to their icon URLs (using CryptoLogos CDN for reliability)
const CRYPTO_ICONS: Record<string, string> = {
  // Main coins - using CryptoLogos.cc CDN which is more reliable
  BTC: "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
  LTC: "https://cryptologos.cc/logos/litecoin-ltc-logo.png",
  ETH: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
  DOGE: "https://cryptologos.cc/logos/dogecoin-doge-logo.png",
  TRX: "https://cryptologos.cc/logos/tron-trx-logo.png",
  FEY: "https://assets.coingecko.com/coins/images/14543/small/feyorra.png",
  ZEC: "https://cryptologos.cc/logos/zcash-zec-logo.png",
  BCH: "https://cryptologos.cc/logos/bitcoin-cash-bch-logo.png",
  DASH: "https://cryptologos.cc/logos/dash-dash-logo.png",
  DGB: "https://cryptologos.cc/logos/digibyte-dgb-logo.png",
  SOL: "https://cryptologos.cc/logos/solana-sol-logo.png",
  BNB: "https://cryptologos.cc/logos/bnb-bnb-logo.png",
  MATIC: "https://cryptologos.cc/logos/polygon-matic-logo.png",
  USDT: "https://cryptologos.cc/logos/tether-usdt-logo.png",
  XRP: "https://cryptologos.cc/logos/xrp-xrp-logo.png",
  ADA: "https://cryptologos.cc/logos/cardano-ada-logo.png",
  AVAX: "https://cryptologos.cc/logos/avalanche-avax-logo.png",
  LINK: "https://cryptologos.cc/logos/chainlink-link-logo.png",
  DOT: "https://cryptologos.cc/logos/polkadot-new-dot-logo.png",
  ATOM: "https://cryptologos.cc/logos/cosmos-atom-logo.png",
  SHIB: "https://cryptologos.cc/logos/shiba-inu-shib-logo.png",
  XLM: "https://cryptologos.cc/logos/stellar-xlm-logo.png",
  USDC: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
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
  const [imageError, setImageError] = useState(false)
  const upperSymbol = symbol?.toUpperCase() || "BTC"
  const iconUrl = CRYPTO_ICONS[upperSymbol]
  const gradient = COIN_GRADIENTS[upperSymbol] || "from-gray-500 to-gray-600"
  // Ensure we have a valid size - fallback to md if invalid
  const validSize = (typeof size === "string" && size in sizes) ? size as keyof typeof sizes : "md"
  const sizeConfig = sizes[validSize]

  // Show image if URL exists and hasn't errored
  if (iconUrl && !imageError) {
    return (
      <div className={cn("relative rounded-full overflow-hidden bg-background", sizeConfig.container, className)}>
        <Image
          src={iconUrl}
          alt={`${upperSymbol} logo`}
          width={sizeConfig.icon}
          height={sizeConfig.icon}
          className="object-contain"
          unoptimized
          onError={() => setImageError(true)}
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

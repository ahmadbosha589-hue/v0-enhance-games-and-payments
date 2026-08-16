import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSatoshi(satoshis: number | bigint): string {
  const num = Number(satoshis)
  if (num >= 100000000) {
    return `${(num / 100000000).toFixed(4)} BTC`
  }
  return `${num.toLocaleString()} sats`
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return "0"
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toLocaleString()
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000)

  if (diffInSeconds < 60) return "just now"
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
  return then.toLocaleDateString()
}

export function formatBTC(satoshis: number | bigint): string {
  const btc = Number(satoshis) / 100000000
  // Use toFixed to avoid scientific notation for very small numbers
  const fixed = btc.toFixed(8)
  // Remove trailing zeros but keep at least 4 decimals for BTC
  return fixed.replace(/(\.\d{4})\d*?0+$/, '$1').replace(/\.?0+$/, '')
}

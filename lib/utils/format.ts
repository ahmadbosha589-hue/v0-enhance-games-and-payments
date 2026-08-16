// Utility functions for formatting

/**
 * Format a number without scientific notation (e.g., 1.5e-7 becomes 0.00000015)
 * Useful for very small crypto amounts
 */
export function formatNoScientific(num: number, maxDecimals: number = 10): string {
  if (num === 0) return "0"
  if (!Number.isFinite(num)) return "0"

  // Use toFixed to avoid scientific notation
  const fixed = num.toFixed(maxDecimals)

  // Remove trailing zeros but keep at least one decimal for clarity
  const trimmed = fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')

  // Handle case where all decimals are zeros but num > 0
  if (trimmed === '0' && num > 0) {
    const str = num.toFixed(20)
    const match = str.match(/0\.(0*)([1-9])/)
    if (match) {
      const zeros = match[1].length
      if (zeros < maxDecimals) {
        return num.toFixed(zeros + 1)
      }
    }
    return `<0.${'0'.repeat(maxDecimals - 1)}1`
  }

  return trimmed
}

/**
 * Format satoshis to BTC with proper decimal places (no scientific notation)
 */
export function formatSatoshis(satoshis: number | null | undefined, decimals = 8): string {
  if (satoshis == null) return "0.00000000"
  const btc = satoshis / 100_000_000
  return formatNoScientific(btc, decimals)
}

/**
 * Format satoshis to a human-readable string with proper formatting
 */
export function formatSatoshisDisplay(satoshis: number | null | undefined): string {
  if (satoshis == null) return "0 sats"

  const absValue = Math.abs(satoshis)

  if (absValue >= 100_000_000) {
    return `${formatSatoshis(satoshis, 4)} BTC`
  }
  if (absValue >= 1_000_000) {
    return `${(satoshis / 1_000_000).toFixed(2)}M sats`
  }
  if (absValue >= 10_000) {
    return `${(satoshis / 1_000).toFixed(1)}K sats`
  }
  if (absValue >= 1_000) {
    return `${satoshis.toLocaleString()} sats`
  }
  return `${satoshis} sats`
}

/**
 * Format a number with commas and optional decimals
 */
export function formatNumber(num: number | null | undefined, decimals?: number): string {
  if (num == null) return "0"

  if (decimals !== undefined) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  }
  return num.toLocaleString()
}

/**
 * Format a large number with K/M/B suffixes
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

/**
 * Format a percentage with optional precision
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Format a date to a relative time string (e.g., "2h ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffSecs < 10) return "just now"
  if (diffSecs < 60) return `${diffSecs}s ago`
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffWeeks < 4) return `${diffWeeks}w ago`
  if (diffMonths < 12) return `${diffMonths}mo ago`

  return then.toLocaleDateString()
}

/**
 * Format seconds to a countdown string (MM:SS or HH:MM:SS)
 */
export function formatCountdown(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

/**
 * Format a date to a full datetime string
 */
export function formatDateTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }
  return new Date(date).toLocaleString(undefined, options || defaultOptions)
}

/**
 * Format a date to just the date portion
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  }
  return new Date(date).toLocaleDateString(undefined, options || defaultOptions)
}

/**
 * Truncate an address or string with ellipsis
 */
export function truncateAddress(address: string, chars = 6): string {
  if (!address) return ""
  if (address.length <= chars * 2 + 3) return address
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

/**
 * Format a rank with ordinal suffix (1st, 2nd, 3rd, etc.)
 */
export function formatRank(rank: number): string {
  const suffix = ["th", "st", "nd", "rd"]
  const v = rank % 100
  return rank + (suffix[(v - 20) % 10] || suffix[v] || suffix[0])
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

/**
 * Format a duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

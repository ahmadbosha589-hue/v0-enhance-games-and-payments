// Platform configuration constants

export const PLATFORM_CONFIG = {
  name: "Faucero",
  description: "Earn free cryptocurrency every 5 minutes",
  version: "1.0.0",

  // Branding
  logo: "/logo.svg",
  favicon: "/favicon.ico",

  // Social links
  social: {
    twitter: "https://twitter.com/faucero",
    discord: "https://discord.gg/faucero",
    telegram: "https://t.me/faucero",
  },

  // Support
  supportEmail: "support@faucero.com",

  // Crypto settings
  currency: {
    name: "Bitcoin",
    symbol: "BTC",
    unit: "satoshis",
    decimals: 8,
  },
} as const

export const CLAIM_CONFIG = {
  cooldownSeconds: 300, // 5 minutes between claims
  baseAmountSatoshis: 4, // Minimum claim amount — matches the UI's advertised range
  maxAmountSatoshis: 9, // Maximum claim amount — matches the UI's advertised range
  streakBonusPercentage: 0, // Legacy flag: real streak bonus is computed server-side (migration 098)
  maxStreakBonusPercentage: 0,
  maxStreakDays: 30,
  referralBonusPercentage: 5, // Tier-1 referral rate; tiers pay 10/5/2 via process_referral_commission
  maxClaimsPerDay: 50, // Max 50 claims per day (~450 sats max from faucet)
} as const

export const REFERRAL_CONFIG = {
  bonusPercentage: 10,
  maxTiers: 3,
  tiers: [
    { tier: 1, percentage: 10 },
    { tier: 2, percentage: 5 },
    { tier: 3, percentage: 2 },
  ],
} as const

export const WITHDRAWAL_CONFIG = {
  minimumSatoshis: 10000, // 10k satoshis minimum
  maximumSatoshis: 30000, // 30k satoshis max per withdrawal
  dailyLimitSatoshis: 30000, // 30k satoshis daily limit
  feePercentage: 0, // No withdrawal fee
  processingTimeMinutes: 5, // 5 minutes processing
  maxPendingWithdrawals: 3, // Max 3 pending withdrawals
} as const

export const FRAUD_CONFIG = {
  scoreThreshold: 70, // Minimum score to flag
  maxClaimsPerIpPerDay: 15, // Increased from 10 to accommodate shared networks
  maxDevicesPerUser: 5,

  // Review thresholds - more granular
  manualReviewScore: 60, // Flag for review (was 50)
  autoBanScore: 95, // Auto-ban threshold (unchanged - high to prevent false positives)
  autoBlockClaimScore: 90, // Block claims but don't ban (new)
  withdrawalBlockScore: 75, // Block withdrawals pending review (was 50)

  // Multi-account limits - slightly relaxed for shared households
  maxAccountsPerIP: 5, // Increased from 3 for shared networks/VPNs
  maxAccountsPerDevice: 2, // Keep strict - same device = same person

  // Grace periods (in hours) to prevent false positives
  newAccountGracePeriod: 24, // Don't flag new accounts heavily for 24h
  ipCooldownHours: 1, // Minimum hours between accounts from same IP

  // Decay settings - fraud scores decrease over time for good behavior
  scoreDecayPerDay: 2, // Points decreased per day of good behavior
  maxScoreDecayPerWeek: 10, // Max decay per week

  suspiciousPatterns: {
    rapidClaims: true,
    multipleAccounts: true,
    vpnDetection: true,
    deviceSpoofing: true,
    impossibleTravel: true, // Different countries within impossible timeframe
    behavioralAnomaly: true, // Unusual claiming patterns
    referralAbuse: true, // Suspicious referral networks
  },
} as const

export const UI_CONFIG = {
  theme: {
    defaultMode: "dark" as const,
    storageKey: "cryptofaucet-theme",
  },
  animations: {
    enabled: true,
    reducedMotion: false,
  },
  toasts: {
    duration: 5000,
    position: "bottom-right" as const,
  },
} as const

// Export aliases for backwards compatibility
export const FRAUD_MANUAL_REVIEW_SCORE = FRAUD_CONFIG.manualReviewScore
export const FRAUD_AUTO_BAN_SCORE = FRAUD_CONFIG.autoBanScore

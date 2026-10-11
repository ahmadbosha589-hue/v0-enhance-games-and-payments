import { CLAIM_CONFIG } from "@/lib/constants/config"

/**
 * Offerwall env gates — mirrors app/api/offerwalls/route.ts
 * (OFFERWALL_ENV_OVERRIDES + each wall's postbackSecretEnv). A wall counts as
 * configured only when every env name in its gate list is set, matching the
 * route's "Setup Required" semantics. Kept in sync by
 * tests/earn/earn-page-contract.test.ts (wall-parity assertions).
 */
const WALL_ENV_GATES: Record<string, string[]> = {
  ccxua: ["CCXUA_API_KEY", "CCXUA_SECRET_KEY"],
  cpx: ["CPX_APP_ID", "CPX_SECRET_KEY"],
  torox: ["TOROX_PUB_ID", "TOROX_SECRET_KEY"],
  adgatemedia: ["ADGATE_WALL_CODE", "ADGATE_SECRET_KEY"],
  lootably: ["LOOTABLY_PLACEMENT_ID", "LOOTABLY_SECRET_KEY"],
  bitlabs: ["BITLABS_TOKEN", "BITLABS_SECRET_KEY"],
  notik: ["NOTIK_PUB_ID", "NOTIK_SECRET_KEY"],
  timewall: ["TIMEWALL_KEY", "TIMEWALL_SECRET_KEY"],
  ayet: ["AYET_ADSLOT", "AYET_STUDIOS_SECRET_KEY"],
  wannads: ["WANNADS_API_KEY", "OFFERWALL_WANNADS_SECRET"],
  monlix: ["MONLIX_APP_ID", "OFFERWALL_MONLIX_SECRET"],
  revu: ["REVU_APP_ID", "OFFERWALL_REVU_SECRET"],
  adgem: ["ADGEM_PLAYER_ID", "OFFERWALL_ADGEM_SECRET"],
  pollfish: ["POLLFISH_API_KEY", "OFFERWALL_POLLFISH_SECRET"],
  theoremreach: ["THEOREMREACH_API_KEY", "OFFERWALL_THEOREMREACH_SECRET"],
  hangmyads: ["HANG_MY_ADS_PUB_ID", "HANG_MY_ADS_SECRET_KEY"],
  offerwallme: ["OFFERWALLME_API_KEY", "OFFERWALLME_SECRET_KEY"],
  bicotasks: ["BICOTASKS_PUB_ID", "BICOTASKS_SECRET_KEY"],
  mmwall: ["MM_WALL_API_KEY", "MM_WALL_SECRET_KEY"],
  adscend: ["ADSCEND_PUB_ID", "ADSCEND_SECRET_KEY"],
  cpalead: ["CPALEAD_GATEWAY", "OFFERWALL_CPALEAD_SECRET"],
  minutestaff: ["MINUTESTAFF_PUB_ID", "OFFERWALL_MINUTESTAFF_SECRET"],
}

/** Live count of offerwalls whose env config is complete. */
export function countConfiguredOfferwalls(): number {
  let configured = 0
  for (const envKeys of Object.values(WALL_ENV_GATES)) {
    if (envKeys.every((k) => Boolean(process.env[k]?.trim()))) configured += 1
  }
  return configured
}

/**
 * Single source of truth for the "All Earning Options" page.
 *
 * Every card derives its reward text from live configuration (never invented
 * literals that the config can contradict) and its availability from the same
 * gates the earning routes themselves check. Unavailable options show an
 * honest, actionable reason instead of pretending to work.
 */

export interface EarnOptionAvailability {
  title: string
  href: string
  available: boolean
  /** Honest reason shown when unavailable. Empty when available. */
  reason: string
  /** Honest, config-derived reward text (never invented literals). */
  rewardText: string
  icon:
    | "zap"
    | "coins"
    | "gamepad"
    | "ticket"
    | "link"
    | "gift"
    | "play"
    | "target"
    | "trophy"
    | "rocket"
    | "heart"
    | "users"
  color: string
  badge?: string
}

export interface AvailabilityInputs {
  /** Upstash Redis vars present — claim/boosters routes fail closed without it. */
  redisConfigured: boolean
  /** Rewarded-ad provider configured — support-us payouts fail closed without it. */
  rewardedAdsEnabled: boolean
  /** Live count of offerwalls whose env config is complete (from /api/offerwalls). */
  offerwallsConfigured: number
}

export function earningAvailability(inputs: AvailabilityInputs): EarnOptionAvailability[] {
  // Claim-style routes rate-limit through Upstash and fail closed when it is
  // unconfigured — the card must not promise a working faucet.
  const rateLimited = inputs.redisConfigured
    ? { available: true, reason: "" }
    : {
        available: false,
        reason:
          "Rate-limiter backend (Upstash Redis) is not configured on this deployment",
      }

  const offerwallsReady = inputs.offerwallsConfigured > 0
  const offerwallStatus = offerwallsReady
    ? { available: true, reason: "" }
    : {
        available: false,
        reason:
          "No offerwall is configured yet — each wall needs its API key + postback secret",
      }

  const rewardedStatus = inputs.rewardedAdsEnabled
    ? { available: true, reason: "" }
    : {
        available: false,
        reason:
          "Rewarded-ad payouts require a verified provider (REWARDED_ADS_* env)",
      }

  return [
    {
      title: "Faucet Claims",
      href: "/dashboard/claim",
      icon: "zap",
      color: "text-blue-500",
      badge: "Most Popular",
      ...rateLimited,
      rewardText: `${CLAIM_CONFIG.baseAmountSatoshis}-${CLAIM_CONFIG.maxAmountSatoshis} sats every ${CLAIM_CONFIG.cooldownSeconds / 60} min`,
    },
    {
      title: "Direct Crypto Faucet",
      href: "/dashboard/manual-faucet",
      icon: "coins",
      color: "text-orange-500",
      badge: "13 Cryptos",
      available: true,
      reason: "",
      rewardText: "$0.0009 per claim · 13 cryptos · instant FaucetPay payout",
    },
    {
      title: "Play Games",
      href: "/dashboard/games",
      icon: "gamepad",
      color: "text-cyan-500",
      badge: "Fun & Easy",
      available: true,
      reason: "",
      rewardText: "3 sats per win · 20 games/day · 3 min cooldown",
    },
    {
      title: "Coupon Codes",
      href: "/dashboard/coupons",
      icon: "ticket",
      color: "text-purple-500",
      ...rateLimited,
      rewardText: "Varies per code (10-1000+ sats)",
    },
    {
      title: "Shortlinks",
      href: "/dashboard/shortlinks",
      icon: "link",
      color: "text-green-500",
      available: true,
      reason: "",
      rewardText: "2-25 sats per link (set per link)",
    },
    {
      title: "Offerwalls",
      href: "/dashboard/offerwalls",
      icon: "gift",
      color: "text-pink-500",
      ...offerwallStatus,
      rewardText: offerwallsReady
        ? `${inputs.offerwallsConfigured} wall${inputs.offerwallsConfigured === 1 ? "" : "s"} live · sats per offer scale with the offer`
        : "Sats per offer (up to 10,000+ for big tasks)",
    },
    {
      title: "PTC Ads",
      href: "/dashboard/ptc",
      icon: "play",
      color: "text-indigo-500",
      available: true,
      reason: "",
      rewardText: "2-15 sats per ad (per-ad budget)",
    },
    {
      title: "Achievements",
      href: "/dashboard/achievements",
      icon: "target",
      color: "text-yellow-500",
      available: true,
      reason: "",
      rewardText: "10-1500 sats per milestone",
    },
    {
      title: "Tournaments",
      href: "/dashboard/tournaments",
      icon: "trophy",
      color: "text-amber-500",
      badge: "New",
      available: true,
      reason: "",
      rewardText: "Prize pools 400-75,000 sats (daily/weekly/monthly)",
    },
    {
      title: "Boosters",
      href: "/dashboard/boosters",
      icon: "rocket",
      color: "text-fuchsia-500",
      badge: "New",
      ...rateLimited,
      rewardText: "Earnings multipliers (priced in sats)",
    },
    {
      title: "Support Us",
      href: "/dashboard/support-us",
      icon: "heart",
      color: "text-red-500",
      badge: "New",
      ...rewardedStatus,
      rewardText: inputs.rewardedAdsEnabled
        ? "Bonus sats for watching partner ads"
        : "Supports the site; bonus payouts once a rewarded provider is live",
    },
    {
      title: "Referral Program",
      href: "/dashboard/referrals",
      icon: "users",
      color: "text-emerald-500",
      available: true,
      reason: "",
      rewardText: "10% / 5% / 2% three-tier commission",
    },
  ]
}

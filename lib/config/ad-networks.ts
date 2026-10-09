/**
 * THE single source of truth for self-serve advertising networks.
 *
 * IMPORTED BY:
 *   • app/dashboard/advertise/page.tsx  (the advertiser UI)
 *   • app/api/advertise/route.ts        (validation + the CPM stored on the campaign)
 *
 * ROOT CAUSE THIS FIXES: the UI and the API each used to declare their own
 * network table. They drifted — the UI offered networks the API's validation
 * rejected with HTTP 400, and minimum budgets and CPMs differed between the
 * two, so the real minimum was up to 5x what the UI displayed and the reach
 * shown to the advertiser used a different CPM than the one persisted to
 * `ad_campaigns.cpm`.
 *
 * By declaring the data exactly once here and importing it in both places the
 * two can no longer disagree. tests/advertise/ad-networks-parity.test.ts
 * enforces the property: reintroducing a local literal or a network id that
 * is not declared here fails the suite.
 */

export interface AdNetworkConfig {
  /** Display name. */
  name: string
  /** One-line description shown on the network card. */
  description: string
  /** Minimum campaign budget in USD. Enforced by BOTH the UI and the API. */
  minBudget: number
  /** USD per 1,000 impressions. Persisted to `ad_campaigns.cpm`. */
  cpm: number
  /** Feature bullets shown on the card. */
  features: string[]
  /** Marketing CTR figure shown on the card. */
  avgCtr: string
  /** Whether the card shows the "Recommended" badge. */
  recommended: boolean
  /** Tailwind gradient classes for the icon tile. */
  color: string
  /** Tailwind background tint classes. */
  bgColor: string
  /** Key into the UI's lucide icon map (see app/dashboard/advertise/page.tsx). */
  iconKey: "Globe" | "Zap" | "BarChart3" | "FileText" | "Bell" | "Eye" | "Award" | "Megaphone"
  /** Optional logo under /public/images/ads/. Empty falls back to the icon tile. */
  logo: string
}

export const AD_NETWORK_CONFIG: Record<string, AdNetworkConfig> = {
  "adsterra": {
    name: "Adsterra",
    description: "Global ad network: banner, native, popunder, social bar",
    minBudget: 25,
    cpm: 0.80,
    features: ["Banner", "Native", "Popunder", "Social Bar"],
    avgCtr: "0.8%",
    recommended: true,
    color: "from-cyan-500 to-sky-600",
    bgColor: "bg-cyan-500/10",
    iconKey: "Globe",
    logo: "/images/ads/crypto-ads.jpg",
  },
  "propellerads": {
    name: "PropellerAds",
    description: "Push, onclick, interstitial and in-page push traffic",
    minBudget: 100,
    cpm: 0.50,
    features: ["Push", "Onclick", "Interstitial", "In-Page Push"],
    avgCtr: "1.1%",
    recommended: true,
    color: "from-pink-500 to-rose-600",
    bgColor: "bg-pink-500/10",
    iconKey: "Bell",
    logo: "/images/ads/push-notifications.jpg",
  },
  "hilltopads": {
    name: "HilltopAds",
    description: "High-performance network with strong pop/push fill rates",
    minBudget: 20,
    cpm: 0.45,
    features: ["Banner", "Pop-under", "In-Page Push", "Video"],
    avgCtr: "0.7%",
    recommended: false,
    color: "from-red-500 to-rose-600",
    bgColor: "bg-red-500/10",
    iconKey: "Zap",
    logo: "/images/ads/banner-network.jpg",
  },
  "coinzilla": {
    name: "Coinzilla",
    description: "Premium crypto advertising network (banner + native)",
    minBudget: 50,
    cpm: 2.00,
    features: ["Crypto Banner", "Native", "Header Banner"],
    avgCtr: "0.9%",
    recommended: true,
    color: "from-amber-500 to-orange-500",
    bgColor: "bg-amber-500/10",
    iconKey: "Award",
    logo: "/images/ads/native-ads.jpg",
  },
  "bitmedia": {
    name: "Bitmedia",
    description: "Bitcoin and crypto ad platform with precise targeting",
    minBudget: 50,
    cpm: 1.50,
    features: ["Crypto Banner", "Native", "Rich Media"],
    avgCtr: "1.0%",
    recommended: false,
    color: "from-orange-500 to-amber-600",
    bgColor: "bg-orange-500/10",
    iconKey: "BarChart3",
    logo: "/images/ads/google-ads.jpg",
  },
  "a-ads": {
    name: "A-ADS",
    description: "Anonymous bitcoin advertising — simple CPM banners",
    minBudget: 5,
    cpm: 0.30,
    features: ["Banner", "Crypto Audience"],
    avgCtr: "0.5%",
    recommended: false,
    color: "from-blue-500 to-blue-600",
    bgColor: "bg-blue-500/10",
    iconKey: "Eye",
    logo: "/images/ads/twitter-ads.jpg",
  },
  "cointraffic": {
    name: "Cointraffic",
    description: "Premium crypto network for banner and native placements",
    minBudget: 100,
    cpm: 2.50,
    features: ["Banner", "Native", "Press Release"],
    avgCtr: "0.9%",
    recommended: false,
    color: "from-emerald-500 to-green-600",
    bgColor: "bg-emerald-500/10",
    iconKey: "FileText",
    logo: "/images/ads/meta-ads.jpg",
  },
  "trafficstars": {
    name: "TrafficStars",
    description: "Self-serve adult-mainstream network with broad formats",
    minBudget: 20,
    cpm: 0.40,
    features: ["Banner", "Native", "Video", "Push"],
    avgCtr: "0.6%",
    recommended: false,
    color: "from-indigo-500 to-violet-600",
    bgColor: "bg-indigo-500/10",
    iconKey: "Globe",
    logo: "/images/ads/tiktok-ads.jpg",
  },
  "coinads": {
    name: "CoinAds",
    description: "Crypto banner, text and popunder network (coinads.io)",
    minBudget: 10,
    cpm: 0.30,
    features: ["Banner", "Text Ads", "Popunder"],
    avgCtr: "0.5%",
    recommended: false,
    color: "from-teal-500 to-cyan-600",
    bgColor: "bg-teal-500/10",
    iconKey: "Megaphone",
    logo: "/images/ads/popup-ads.jpg",
  },
}

/**
 * Network ids in declaration order (insertion order is stable for string keys
 * in V8, so this matches the order the object literal above is written in).
 * Typed as a non-empty tuple because zod's `z.enum` requires one.
 */
export const AD_NETWORK_IDS = Object.keys(AD_NETWORK_CONFIG) as [string, ...string[]]

/** True when `budget` clears the network's advertised minimum. */
export function meetsMinBudget(network: string, budget: number): boolean {
  const cfg = AD_NETWORK_CONFIG[network]
  return !!cfg && budget >= cfg.minBudget
}

/** The CPM persisted for a campaign on `network`, or undefined if unknown. */
export function cpmFor(network: string): number | undefined {
  return AD_NETWORK_CONFIG[network]?.cpm
}

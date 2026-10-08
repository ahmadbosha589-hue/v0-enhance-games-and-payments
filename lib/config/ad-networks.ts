/**
 * Single source of truth for advertiser-facing ad networks.
 *
 * IMPORTED BY:
 *   • app/dashboard/advertise/page.tsx  (the advertiser UI)
 *   • app/api/advertise/route.ts        (validation + the CPM stored on the campaign)
 *
 * ROOT CAUSE THIS FIXES: the UI and the API each used to declare their own
 * network table. They drifted — the UI offered 9 networks (including
 * "crypto-ads") while the API's zod enum accepted only 8, so choosing Crypto
 * Networks returned HTTP 400; and every network's minimum budget and CPM
 * differed between the two, so the real minimum was up to 5x what the UI
 * displayed and the reach shown to the advertiser used a different CPM than
 * the one persisted to `ad_campaigns.cpm`.
 *
 * By declaring the data exactly once here and importing it in both places the
 * two can no longer disagree.
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
  iconKey: "Globe" | "Zap" | "BarChart3" | "FileText" | "Bell" | "Eye" | "Award"
  /** Optional logo under /public/images/ads/. Empty falls back to the icon tile. */
  logo: string
}

export const AD_NETWORK_CONFIG: Record<string, AdNetworkConfig> = {
  "google-ads": {
    name: "Google Ads",
    description: "Search, Display & YouTube advertising",
    minBudget: 50,
    cpm: 2.5,
    features: ["Search Ads", "Display Network", "YouTube", "Gmail"],
    avgCtr: "2.5%",
    recommended: true,
    color: "from-blue-500 to-blue-600",
    bgColor: "bg-blue-500/10",
    iconKey: "Globe",
    logo: "/images/ads/google-ads.jpg",
  },
  "facebook-ads": {
    name: "Meta Ads",
    description: "Facebook & Instagram advertising",
    minBudget: 25,
    cpm: 3.0,
    features: ["Facebook Feed", "Instagram", "Stories", "Reels"],
    avgCtr: "1.8%",
    recommended: true,
    color: "from-indigo-500 to-purple-600",
    bgColor: "bg-indigo-500/10",
    iconKey: "Globe",
    logo: "/images/ads/meta-ads.jpg",
  },
  "tiktok-ads": {
    name: "TikTok Ads",
    description: "Short-form video advertising",
    minBudget: 20,
    cpm: 1.5,
    features: ["In-Feed", "TopView", "Spark Ads", "Branded Effects"],
    avgCtr: "3.2%",
    recommended: false,
    color: "from-pink-500 to-rose-600",
    bgColor: "bg-pink-500/10",
    iconKey: "Zap",
    logo: "/images/ads/tiktok-ads.jpg",
  },
  "twitter-ads": {
    name: "X (Twitter) Ads",
    description: "Promoted tweets and trends",
    minBudget: 30,
    cpm: 4.0,
    features: ["Promoted Tweets", "Trends", "Followers", "Video"],
    avgCtr: "1.5%",
    recommended: false,
    color: "from-slate-600 to-slate-800",
    bgColor: "bg-slate-500/10",
    iconKey: "Globe",
    logo: "/images/ads/twitter-ads.jpg",
  },
  "banner-network": {
    name: "Display Network",
    description: "Banner ads on 10,000+ websites",
    minBudget: 10,
    cpm: 0.5,
    features: ["Banner Ads", "Rich Media", "Retargeting", "Programmatic"],
    avgCtr: "0.5%",
    recommended: false,
    color: "from-amber-500 to-orange-600",
    bgColor: "bg-amber-500/10",
    iconKey: "BarChart3",
    logo: "/images/ads/banner-network.jpg",
  },
  "native-ads": {
    name: "Native Ads",
    description: "Content-style native advertising",
    minBudget: 15,
    cpm: 1.0,
    features: ["Content Widgets", "In-Feed", "Recommendation", "Outbrain/Taboola"],
    avgCtr: "1.2%",
    recommended: false,
    color: "from-emerald-500 to-green-600",
    bgColor: "bg-emerald-500/10",
    iconKey: "FileText",
    logo: "/images/ads/native-ads.jpg",
  },
  "push-notifications": {
    name: "Push Notifications",
    description: "Browser push notification ads",
    minBudget: 5,
    cpm: 0.3,
    features: ["Browser Push", "In-Page Push", "Calendar Push", "Native Push"],
    avgCtr: "4.5%",
    recommended: false,
    color: "from-cyan-500 to-teal-600",
    bgColor: "bg-cyan-500/10",
    iconKey: "Bell",
    logo: "/images/ads/push-notifications.jpg",
  },
  "popup-ads": {
    name: "Pop Traffic",
    description: "Pop-under and interstitial ads",
    minBudget: 5,
    cpm: 0.2,
    features: ["Pop-Under", "Interstitial", "Tab-Under", "Direct Link"],
    avgCtr: "0.3%",
    recommended: false,
    color: "from-red-500 to-rose-600",
    bgColor: "bg-red-500/10",
    iconKey: "Eye",
    logo: "/images/ads/popup-ads.jpg",
  },
  "crypto-ads": {
    name: "Crypto Networks",
    description: "Crypto-focused advertising",
    minBudget: 25,
    cpm: 2.0,
    features: ["Coinzilla", "A-Ads", "Bitmedia", "CoinTraffic"],
    avgCtr: "1.0%",
    recommended: true,
    color: "from-orange-500 to-amber-500",
    bgColor: "bg-orange-500/10",
    iconKey: "Award",
    logo: "/images/ads/crypto-ads.jpg",
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
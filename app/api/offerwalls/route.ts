import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import {
  getProviderCompletionStats,
  getPlatformCompletionStats,
} from "@/lib/completions"

export const dynamic = "force-dynamic"

// Offerwall configurations with static data and API endpoints
interface OfferwallConfig {
  id: string
  name: string
  slug: string
  description: string
  logo: string
  color: string
  bgGradient: string
  minPayout: number
  conversionRate: number // How many satoshi per dollar earned
  features: string[]
  url: string // URL template — gets resolved server-side from env vars
  active: boolean
  priority: number
  // env-var placeholders this offerwall needs in order to build a working URL.
  // If any of these is missing, the offerwall is rendered as "Setup Required".
  requiredEnv: string[]
  // Postback secret env var(s) this offerwall needs so its server-to-server
  // callback can be authenticated. Mirrors PROVIDER_SECRETS in
  // app/api/postback/[provider]/route.ts: without the secret the handler
  // FAILS CLOSED (403 invalid-signature) and can never credit anyone, so the
  // wall renders as "Setup Required" (still visible) until the operator sets
  // it. Names only — secret values are never stored here.
  postbackSecretEnv?: string[]
}

const OFFERWALLS: OfferwallConfig[] = [
  {
    id: "ccxua",
    name: "c.cx.ua",
    slug: "ccxua",
    description:
      "Premium auto-translated offers worldwide. High-converting CPA offers, surveys, and app installs from our newest partner.",
    logo: "/images/offerwalls/ccxua.jpg",
    color: "#06B6D4",
    bgGradient: "from-cyan-500/20 to-teal-600/10",
    minPayout: 0,
    // Effective rate users see: c.cx.ua dashboard Exchange Rate (20) ×
    // DB conversion_rate (50 sats/credit) = ~1000 sats per USD of offer payout.
    // Keep this in sync with scripts/095_ccxua_and_provider_seeds.sql.
    conversionRate: 1000,
    features: ["Auto-translated", "Global offers", "Fast crediting", "Featured"],
    url: "https://c.cx.ua/offerwall/{ccxua_api_key}/{user_id}",
    active: true,
    priority: 0,
    requiredEnv: ["CCXUA_API_KEY"],
    postbackSecretEnv: ["CCXUA_SECRET_KEY"],
  },
  {
    id: "cpx",
    name: "CPX Research",
    slug: "cpx-research",
    description: "Complete high-paying surveys from trusted research companies. Average payout: 50-200 sats per survey.",
    logo: "/offerwalls/cpx-research/logo-light.png",
    color: "#00C853",
    bgGradient: "from-green-500/20 to-green-600/10",
    minPayout: 0,
    conversionRate: 1000,
    features: ["Instant payouts", "Many surveys", "Mobile friendly"],
    url: "https://offers.cpx-research.com/?app_id={app_id}&ext_user_id={user_id}",
    active: true,
    priority: 1,
    requiredEnv: ["CPX_APP_ID"],
    postbackSecretEnv: ["CPX_SECRET_KEY"],
  },
  {
    id: "torox",
    name: "Torox",
    slug: "torox",
    description: "High-paying offers and app downloads",
    logo: "",
    color: "#FF6B00",
    bgGradient: "from-orange-500/20 to-orange-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["App downloads", "Video rewards", "Easy tasks"],
    url: "https://torox.io/ifr/{pub_id}/{user_id}",
    active: true,
    priority: 2,
    requiredEnv: ["TOROX_PUB_ID"],
    postbackSecretEnv: ["TOROX_SECRET_KEY"],
  },
  {
    id: "adgatemedia",
    name: "AdGate Media",
    slug: "adgatemedia",
    description: "Wide variety of offers and surveys",
    logo: "",
    color: "#2196F3",
    bgGradient: "from-blue-500/20 to-blue-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Diverse offers", "High payouts", "Daily bonuses"],
    url: "https://wall.adgaterewards.com/{wall_code}/{user_id}",
    active: true,
    priority: 3,
    requiredEnv: ["ADGATE_WALL_CODE"],
    postbackSecretEnv: ["ADGATE_SECRET_KEY"],
  },
  {
    id: "lootably",
    name: "Lootably",
    slug: "lootably",
    description: "Premium offers with high rewards",
    logo: "",
    color: "#9C27B0",
    bgGradient: "from-purple-500/20 to-purple-600/10",
    minPayout: 0,
    conversionRate: 1000,
    features: ["Premium offers", "Game rewards", "Survey options"],
    url: "https://wall.lootably.com/?placementID={placement_id}&sid={user_id}",
    active: true,
    priority: 4,
    requiredEnv: ["LOOTABLY_PLACEMENT_ID"],
    postbackSecretEnv: ["LOOTABLY_SECRET_KEY"],
  },
  {
    id: "bitlabs",
    name: "BitLabs",
    slug: "bitlabs",
    description: "Quick surveys with instant credit",
    logo: "",
    color: "#00BCD4",
    bgGradient: "from-cyan-500/20 to-cyan-600/10",
    minPayout: 0,
    conversionRate: 1000,
    features: ["Quick surveys", "Instant credit", "Mobile optimized"],
    url: "https://web.bitlabs.ai/?uid={user_id}&token={api_token}",
    active: true,
    priority: 5,
    requiredEnv: ["BITLABS_TOKEN"],
    postbackSecretEnv: ["BITLABS_SECRET_KEY"],
  },
  {
    id: "notik",
    name: "Notik",
    slug: "notik",
    description: "Video ads and simple tasks",
    logo: "",
    color: "#E91E63",
    bgGradient: "from-pink-500/20 to-pink-600/10",
    minPayout: 0,
    conversionRate: 850,
    features: ["Video rewards", "Simple tasks", "Fast earnings"],
    url: "https://notik.me/coins/{pub_id}?userId={user_id}",
    active: true,
    priority: 6,
    requiredEnv: ["NOTIK_PUB_ID"],
    postbackSecretEnv: ["NOTIK_SECRET_KEY"],
  },
  {
    id: "timewall",
    name: "Timewall",
    slug: "timewall",
    description: "Earn by spending time on content",
    logo: "",
    color: "#FF9800",
    bgGradient: "from-amber-500/20 to-amber-600/10",
    minPayout: 0,
    conversionRate: 800,
    features: ["Time-based", "Content viewing", "Easy earnings"],
    url: "https://timewall.io/?uid={user_id}&key={api_key}",
    active: true,
    priority: 7,
    requiredEnv: ["TIMEWALL_KEY"],
    postbackSecretEnv: ["TIMEWALL_SECRET_KEY"],
  },
  {
    id: "ayet",
    name: "ayeT-Studios",
    slug: "ayet-studios",
    description: "Mobile games and app offers",
    logo: "",
    color: "#4CAF50",
    bgGradient: "from-green-500/20 to-green-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Mobile games", "App installs", "High rewards"],
    url: "https://www.ayetstudios.com/offers/{adslot_id}?external_identifier={user_id}",
    active: true,
    priority: 8,
    requiredEnv: ["AYET_ADSLOT"],
    postbackSecretEnv: ["AYET_STUDIOS_SECRET_KEY"],
  },
  {
    id: "wannads",
    name: "Wannads",
    slug: "wannads",
    description: "Easy tasks and survey completion",
    logo: "",
    color: "#3F51B5",
    bgGradient: "from-indigo-500/20 to-indigo-600/10",
    minPayout: 0,
    conversionRate: 900,
    features: ["Easy surveys", "Quick tasks", "Daily offers"],
    url: "https://wannads.com/wall/{api_key}/{user_id}",
    active: true,
    priority: 9,
    requiredEnv: ["WANNADS_API_KEY"],
    postbackSecretEnv: ["OFFERWALL_WANNADS_SECRET"],
  },
  {
    id: "monlix",
    name: "Monlix",
    slug: "monlix",
    description: "Premium surveys and offer completion",
    logo: "",
    color: "#673AB7",
    bgGradient: "from-violet-500/20 to-violet-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Premium surveys", "High payouts", "Fast credit"],
    url: "https://offers.monlix.com/?appid={app_id}&userid={user_id}",
    active: true,
    priority: 10,
    requiredEnv: ["MONLIX_APP_ID"],
    postbackSecretEnv: ["OFFERWALL_MONLIX_SECRET"],
  },
  {
    id: "revu",
    name: "Revenue Universe",
    slug: "revu",
    description: "Surveys and premium offers",
    logo: "",
    color: "#009688",
    bgGradient: "from-teal-500/20 to-teal-600/10",
    minPayout: 0,
    conversionRate: 900,
    features: ["Premium surveys", "Bonus offers", "Quick payout"],
    url: "https://wall.revenueuniverse.com/{app_id}/{user_id}",
    active: true,
    priority: 11,
    requiredEnv: ["REVU_APP_ID"],
    postbackSecretEnv: ["OFFERWALL_REVU_SECRET"],
  },
  {
    id: "adgem",
    name: "AdGem",
    slug: "adgem",
    description: "Mobile offers and game downloads",
    logo: "",
    color: "#FF5722",
    bgGradient: "from-orange-500/20 to-red-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Mobile offers", "Game downloads", "Quick rewards"],
    url: "https://adgem.com/wall/{player_id}/{user_id}",
    active: true,
    priority: 12,
    requiredEnv: ["ADGEM_PLAYER_ID"],
    postbackSecretEnv: ["OFFERWALL_ADGEM_SECRET"],
  },
  {
    id: "pollfish",
    name: "Pollfish",
    slug: "pollfish",
    description: "Short surveys with fast rewards",
    logo: "",
    color: "#795548",
    bgGradient: "from-amber-700/20 to-amber-800/10",
    minPayout: 0,
    conversionRate: 1000,
    features: ["Short surveys", "Quick rewards", "Mobile friendly"],
    url: "https://www.pollfish.com/show/{api_key}/{user_id}",
    active: true,
    priority: 13,
    requiredEnv: ["POLLFISH_API_KEY"],
    postbackSecretEnv: ["OFFERWALL_POLLFISH_SECRET"],
  },
  {
    id: "theoremreach",
    name: "TheoremReach",
    slug: "theoremreach",
    description: "Quality surveys with good payouts",
    logo: "",
    color: "#607D8B",
    bgGradient: "from-slate-500/20 to-slate-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Quality surveys", "Good payouts", "Fast credit"],
    url: "https://theoremreach.com/respondent_entry/{api_key}/{user_id}",
    active: true,
    priority: 14,
    requiredEnv: ["THEOREMREACH_API_KEY"],
    postbackSecretEnv: ["OFFERWALL_THEOREMREACH_SECRET"],
  },
  {
    id: "hangmyads",
    name: "HangMyAds",
    slug: "hang-my-ads",
    description: "High-converting CPA offers with great payouts",
    logo: "",
    color: "#8B5CF6",
    bgGradient: "from-violet-500/20 to-violet-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["CPA offers", "High payouts", "Fast credit"],
    url: "https://hangmyads.com/wall/{pub_id}/{user_id}",
    active: true,
    priority: 15,
    requiredEnv: ["HANG_MY_ADS_PUB_ID"],
    postbackSecretEnv: ["HANG_MY_ADS_SECRET_KEY"],
  },
  {
    id: "offerwallme",
    name: "Offerwall.me",
    slug: "offerwall-me",
    description: "Multi-network aggregator with many offers",
    logo: "",
    color: "#10B981",
    bgGradient: "from-emerald-500/20 to-emerald-600/10",
    minPayout: 0,
    conversionRate: 900,
    features: ["Multi-network", "Many offers", "Easy tasks"],
    url: "https://offerwall.me/wall/{api_key}/{user_id}",
    active: true,
    priority: 16,
    requiredEnv: ["OFFERWALLME_API_KEY"],
    postbackSecretEnv: ["OFFERWALLME_SECRET_KEY"],
  },
  {
    id: "bicotasks",
    name: "BicoTasks",
    slug: "bicotasks",
    description: "Task-based earning with daily bonuses",
    logo: "",
    color: "#F59E0B",
    bgGradient: "from-yellow-500/20 to-yellow-600/10",
    minPayout: 0,
    conversionRate: 850,
    features: ["Daily tasks", "Bonus offers", "Quick pay"],
    url: "https://bicotasks.com/wall/{pub_id}/{user_id}",
    active: true,
    priority: 17,
    requiredEnv: ["BICOTASKS_PUB_ID"],
    postbackSecretEnv: ["BICOTASKS_SECRET_KEY"],
  },
  {
    id: "mmwall",
    name: "MM Wall",
    slug: "mm-wall",
    description: "Simple tasks for quick earnings",
    logo: "",
    color: "#EC4899",
    bgGradient: "from-pink-500/20 to-pink-600/10",
    minPayout: 0,
    conversionRate: 800,
    features: ["Simple tasks", "Quick earnings", "Beginner friendly"],
    url: "https://mmwall.io/wall/{api_key}/{user_id}",
    active: true,
    priority: 18,
    requiredEnv: ["MM_WALL_API_KEY"],
    postbackSecretEnv: ["MM_WALL_SECRET_KEY"],
  },
  {
    id: "adscend",
    name: "Adscend Media",
    slug: "adscend",
    description: "Premium CPA network with exclusive offers",
    logo: "",
    color: "#6366F1",
    bgGradient: "from-indigo-500/20 to-indigo-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Premium CPA", "Exclusive offers", "Reliable tracking"],
    url: "https://adscendmedia.com/wall/{pub_id}/{user_id}",
    active: true,
    priority: 19,
    requiredEnv: ["ADSCEND_PUB_ID"],
    postbackSecretEnv: ["ADSCEND_SECRET_KEY"],
  },
  {
    id: "cpalead",
    name: "CPALead",
    slug: "cpalead",
    description: "Trusted CPA network with many offers",
    logo: "",
    color: "#DC2626",
    bgGradient: "from-red-500/20 to-red-600/10",
    minPayout: 0,
    conversionRate: 900,
    features: ["CPA offers", "Trusted network", "Many options"],
    url: "https://cpalead.com/wall/{gateway_id}/{user_id}",
    active: true,
    priority: 20,
    requiredEnv: ["CPALEAD_GATEWAY"],
    postbackSecretEnv: ["OFFERWALL_CPALEAD_SECRET"],
  },
  {
    id: "minutestaff",
    name: "Minutestaff",
    slug: "minutestaff",
    description: "Quick micro-tasks for instant rewards",
    logo: "",
    color: "#14B8A6",
    bgGradient: "from-teal-500/20 to-teal-600/10",
    minPayout: 0,
    conversionRate: 850,
    features: ["Micro-tasks", "Instant rewards", "Quick earnings"],
    url: "https://minutestaff.com/wall/{pub_id}/{user_id}",
    active: true,
    priority: 21,
    requiredEnv: ["MINUTESTAFF_PUB_ID"],
    postbackSecretEnv: ["OFFERWALL_MINUTESTAFF_SECRET"],
  },
]

// ── URL builder ────────────────────────────────────────────────────────────────
// Resolve placeholders server-side from env vars so we never leak literal
// "{ccxua_api_key}" placeholders to the client (which would 404). Each
// placeholder maps to one (or many) env-var fallbacks. Server-side only —
// the API key never ships to the browser.
const PLACEHOLDER_TO_ENV: Record<string, string[]> = {
  ccxua_api_key: ["CCXUA_API_KEY", "NEXT_PUBLIC_CCXUA_API_KEY"],
  app_id: [
    "CPX_APP_ID",
    "NEXT_PUBLIC_CPX_APP_ID",
    "MONLIX_APP_ID",
    "REVU_APP_ID",
  ],
  pub_id: [
    "TOROX_PUB_ID",
    "NEXT_PUBLIC_TOROX_PUB_ID",
    "NOTIK_PUB_ID",
    "HANG_MY_ADS_PUB_ID",
    "BICOTASKS_PUB_ID",
    "ADSCEND_PUB_ID",
    "MINUTESTAFF_PUB_ID",
  ],
  wall_code: ["ADGATE_WALL_CODE", "NEXT_PUBLIC_ADGATE_WALL_CODE"],
  placement_id: ["LOOTABLY_PLACEMENT_ID", "NEXT_PUBLIC_LOOTABLY_PLACEMENT_ID"],
  api_token: ["BITLABS_TOKEN", "NEXT_PUBLIC_BITLABS_TOKEN"],
  api_key: [
    "TIMEWALL_KEY",
    "NEXT_PUBLIC_TIMEWALL_KEY",
    "WANNADS_API_KEY",
    "POLLFISH_API_KEY",
    "THEOREMREACH_API_KEY",
    "OFFERWALLME_API_KEY",
    "MM_WALL_API_KEY",
  ],
  adslot_id: ["AYET_ADSLOT", "NEXT_PUBLIC_AYET_ADSLOT"],
  player_id: ["ADGEM_PLAYER_ID", "NEXT_PUBLIC_ADGEM_PLAYER_ID"],
  gateway_id: ["CPALEAD_GATEWAY", "NEXT_PUBLIC_CPALEAD_GATEWAY"],
}

// Per-offerwall override so the right key is chosen even when several
// providers share the same placeholder name (e.g. "pub_id", "api_key").
const OFFERWALL_ENV_OVERRIDES: Record<string, Record<string, string[]>> = {
  ccxua: { ccxua_api_key: ["CCXUA_API_KEY"] },
  cpx: { app_id: ["CPX_APP_ID", "NEXT_PUBLIC_CPX_APP_ID"] },
  torox: { pub_id: ["TOROX_PUB_ID", "NEXT_PUBLIC_TOROX_PUB_ID"] },
  notik: { pub_id: ["NOTIK_PUB_ID"] },
  hangmyads: { pub_id: ["HANG_MY_ADS_PUB_ID"] },
  bicotasks: { pub_id: ["BICOTASKS_PUB_ID"] },
  adscend: { pub_id: ["ADSCEND_PUB_ID"] },
  minutestaff: { pub_id: ["MINUTESTAFF_PUB_ID"] },
  adgatemedia: { wall_code: ["ADGATE_WALL_CODE", "NEXT_PUBLIC_ADGATE_WALL_CODE"] },
  lootably: { placement_id: ["LOOTABLY_PLACEMENT_ID", "NEXT_PUBLIC_LOOTABLY_PLACEMENT_ID"] },
  bitlabs: { api_token: ["BITLABS_TOKEN", "NEXT_PUBLIC_BITLABS_TOKEN"] },
  timewall: { api_key: ["TIMEWALL_KEY", "NEXT_PUBLIC_TIMEWALL_KEY"] },
  ayet: { adslot_id: ["AYET_ADSLOT", "NEXT_PUBLIC_AYET_ADSLOT"] },
  wannads: { api_key: ["WANNADS_API_KEY"] },
  monlix: { app_id: ["MONLIX_APP_ID"] },
  revu: { app_id: ["REVU_APP_ID"] },
  adgem: { player_id: ["ADGEM_PLAYER_ID", "NEXT_PUBLIC_ADGEM_PLAYER_ID"] },
  pollfish: { api_key: ["POLLFISH_API_KEY"] },
  theoremreach: { api_key: ["THEOREMREACH_API_KEY"] },
  offerwallme: { api_key: ["OFFERWALLME_API_KEY"] },
  mmwall: { api_key: ["MM_WALL_API_KEY"] },
  cpalead: { gateway_id: ["CPALEAD_GATEWAY", "NEXT_PUBLIC_CPALEAD_GATEWAY"] },
}

function resolveEnv(keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k]
    if (v && v.trim()) return v.trim()
  }
  return ""
}

function buildOfferwallUrl(
  cfg: OfferwallConfig,
  userId: string,
): { url: string; configured: boolean; missing: string[] } {
  const placeholders = Array.from(cfg.url.matchAll(/\{([a-z_]+)\}/gi)).map((m) => m[1])
  const overrides = OFFERWALL_ENV_OVERRIDES[cfg.id] || {}
  const missing: string[] = []
  let url = cfg.url

  for (const ph of placeholders) {
    if (ph === "user_id") {
      url = url.replaceAll(`{${ph}}`, encodeURIComponent(userId || ""))
      if (!userId) missing.push("user_id")
      continue
    }
    const envKeys = overrides[ph] || PLACEHOLDER_TO_ENV[ph] || []
    const val = resolveEnv(envKeys)
    if (!val) {
      missing.push(envKeys[0] || ph.toUpperCase())
    }
    url = url.replaceAll(`{${ph}}`, val)
  }

  // Postback-secret gate — mirrors the postback route's fail-closed rule:
  // without its secret a wall's S2S callbacks answer 403 invalid-signature
  // and nobody can ever be credited, so the wall must not present itself as
  // fully active. It stays listed/rendered ("Setup Required" state).
  for (const envKey of cfg.postbackSecretEnv ?? []) {
    if (!resolveEnv([envKey])) missing.push(envKey)
  }

  return { url, configured: missing.length === 0, missing }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get("slug")
    const includeStats = searchParams.get("stats") === "true"

    // Get user session
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const userId = user?.id || ""

    // Stats helper — delegated to the unified completions layer.
    //
    // History: the old implementation read only from `transactions` and
    // ILIKE'd the display name into the description. That silently returned
    // 0 because descriptions contain the SLUG, not the display name (e.g.
    // "Some Offer (ccxua)" doesn't contain "c.cx.ua"). It also missed every
    // conversion where the postback chain partially failed (the conversion
    // row exists but the transaction row never got written, so the card
    // said "0 completions" even though we credited the user).
    //
    // The unified helper reads from BOTH `offerwall_conversions` (primary,
    // written first) and `transactions` (legacy/fallback), deduped by
    // transaction_id, so the numbers can never disagree again.
    async function fetchProviderStats(providerSlug: string, _providerName: string) {
      const s = await getProviderCompletionStats(providerSlug, user?.id)
      return {
        totalPaid: s.total_paid,
        completionCount: s.completion_count,
        userEarnings: s.user_earnings,
        userCompletions: s.user_completions,
      }
    }

    // If requesting a specific offerwall
    if (slug) {
      const offerwall = OFFERWALLS.find((o) => o.slug === slug || o.id === slug)
      if (!offerwall) {
        return NextResponse.json({ error: "Offerwall not found" }, { status: 404 })
      }

      const { url, configured } = buildOfferwallUrl(offerwall, userId)

      let stats = null
      if (includeStats) {
        const s = await fetchProviderStats(offerwall.slug, offerwall.name)
        stats = {
          total_paid: s.totalPaid,
          completion_count: s.completionCount,
          user_earnings: s.userEarnings,
        }
      }

      return NextResponse.json({
        offerwall: { ...offerwall, url, configured },
        stats,
      })
    }

    // Get all offerwalls with optional stats
    const offerwallsWithStats = await Promise.all(
      OFFERWALLS.filter((o) => o.active).map(async (offerwall) => {
        const { url, configured } = buildOfferwallUrl(offerwall, userId)

        if (!includeStats) {
          return { ...offerwall, url, configured, stats: null }
        }

        const s = await fetchProviderStats(offerwall.slug, offerwall.name)
        return {
          ...offerwall,
          url,
          configured,
          stats: {
            total_paid: s.totalPaid,
            completion_count: s.completionCount,
            user_earnings: s.userEarnings,
            user_completions: s.userCompletions,
          },
        }
      }),
    )

    // Sort by priority — c.cx.ua (priority 0) is always first
    offerwallsWithStats.sort((a, b) => a.priority - b.priority)

    // Platform-wide stats — pulled from the unified completions layer so
    // conversions that never made it into the `transactions` table (because
    // an upstream postback step failed) are still counted.
    const platformAgg = await getPlatformCompletionStats()
    const platformStats = {
      total_paid_all_offerwalls: platformAgg.total_paid_all_offerwalls,
      total_completions: platformAgg.total_completions,
      active_offerwalls: OFFERWALLS.filter((o) => o.active).length,
    }

    return NextResponse.json({
      offerwalls: offerwallsWithStats,
      platformStats,
    })
  } catch (error) {
    console.error("Offerwalls API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

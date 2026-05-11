import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

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
  url: string // URL template with {user_id} placeholder
  active: boolean
  priority: number
}

const OFFERWALLS: OfferwallConfig[] = [
  {
    id: "ccxua",
    name: "c.cx.ua",
    slug: "ccxua",
    description: "Premium auto-translated offers worldwide. New partner with high-converting CPA offers, surveys, and app installs.",
    logo: "/images/offerwalls/ccxua.jpg",
    color: "#06B6D4",
    bgGradient: "from-cyan-500/20 to-teal-600/10",
    minPayout: 0,
    conversionRate: 1000,
    features: ["Auto-translated", "Global offers", "Fast crediting", "New"],
    url: "https://c.cx.ua/offerwall/{ccxua_api_key}/{user_id}",
    active: true,
    priority: 0,
  },
  {
    id: "cpx",
    name: "CPX Research",
    slug: "cpx-research",
    description: "Complete high-paying surveys from trusted research companies. Average payout: 50-200 sats per survey.",
    logo: "/images/offerwalls/cpx.png",
    color: "#00C853",
    bgGradient: "from-green-500/20 to-green-600/10",
    minPayout: 0,
    conversionRate: 1000,
    features: ["Instant payouts", "Many surveys", "Mobile friendly"],
    url: "https://offers.cpx-research.com/?app_id={app_id}&ext_user_id={user_id}",
    active: true,
    priority: 1,
  },
  {
    id: "torox",
    name: "Torox",
    slug: "torox",
    description: "High-paying offers and app downloads",
    logo: "/images/offerwalls/torox.png",
    color: "#FF6B00",
    bgGradient: "from-orange-500/20 to-orange-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["App downloads", "Video rewards", "Easy tasks"],
    url: "https://torox.io/ifr/{pub_id}/{user_id}",
    active: true,
    priority: 2,
  },
  {
    id: "adgatemedia",
    name: "AdGate Media",
    slug: "adgatemedia",
    description: "Wide variety of offers and surveys",
    logo: "/images/offerwalls/adgate.png",
    color: "#2196F3",
    bgGradient: "from-blue-500/20 to-blue-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Diverse offers", "High payouts", "Daily bonuses"],
    url: "https://wall.adgaterewards.com/{wall_code}/{user_id}",
    active: true,
    priority: 3,
  },
  {
    id: "lootably",
    name: "Lootably",
    slug: "lootably",
    description: "Premium offers with high rewards",
    logo: "/images/offerwalls/lootably.png",
    color: "#9C27B0",
    bgGradient: "from-purple-500/20 to-purple-600/10",
    minPayout: 0,
    conversionRate: 1000,
    features: ["Premium offers", "Game rewards", "Survey options"],
    url: "https://wall.lootably.com/?placementID={placement_id}&sid={user_id}",
    active: true,
    priority: 4,
  },
  {
    id: "bitlabs",
    name: "BitLabs",
    slug: "bitlabs",
    description: "Quick surveys with instant credit",
    logo: "/images/offerwalls/bitlabs.png",
    color: "#00BCD4",
    bgGradient: "from-cyan-500/20 to-cyan-600/10",
    minPayout: 0,
    conversionRate: 1000,
    features: ["Quick surveys", "Instant credit", "Mobile optimized"],
    url: "https://web.bitlabs.ai/?uid={user_id}&token={api_token}",
    active: true,
    priority: 5,
  },
  {
    id: "notik",
    name: "Notik",
    slug: "notik",
    description: "Video ads and simple tasks",
    logo: "/images/offerwalls/notik.png",
    color: "#E91E63",
    bgGradient: "from-pink-500/20 to-pink-600/10",
    minPayout: 0,
    conversionRate: 850,
    features: ["Video rewards", "Simple tasks", "Fast earnings"],
    url: "https://notik.me/coins/{pub_id}?userId={user_id}",
    active: true,
    priority: 6,
  },
  {
    id: "timewall",
    name: "Timewall",
    slug: "timewall",
    description: "Earn by spending time on content",
    logo: "/images/offerwalls/timewall.png",
    color: "#FF9800",
    bgGradient: "from-amber-500/20 to-amber-600/10",
    minPayout: 0,
    conversionRate: 800,
    features: ["Time-based", "Content viewing", "Easy earnings"],
    url: "https://timewall.io/?uid={user_id}&key={api_key}",
    active: true,
    priority: 7,
  },
  {
    id: "ayet",
    name: "ayeT-Studios",
    slug: "ayet-studios",
    description: "Mobile games and app offers",
    logo: "/images/offerwalls/ayet.png",
    color: "#4CAF50",
    bgGradient: "from-green-500/20 to-green-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Mobile games", "App installs", "High rewards"],
    url: "https://www.ayetstudios.com/offers/{adslot_id}?external_identifier={user_id}",
    active: true,
    priority: 8,
  },
  {
    id: "wannads",
    name: "Wannads",
    slug: "wannads",
    description: "Easy tasks and survey completion",
    logo: "/images/offerwalls/wannads.png",
    color: "#3F51B5",
    bgGradient: "from-indigo-500/20 to-indigo-600/10",
    minPayout: 0,
    conversionRate: 900,
    features: ["Easy surveys", "Quick tasks", "Daily offers"],
    url: "https://wannads.com/wall/{api_key}/{user_id}",
    active: true,
    priority: 9,
  },
  {
    id: "monlix",
    name: "Monlix",
    slug: "monlix",
    description: "Premium surveys and offer completion",
    logo: "/images/offerwalls/monlix.png",
    color: "#673AB7",
    bgGradient: "from-violet-500/20 to-violet-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Premium surveys", "High payouts", "Fast credit"],
    url: "https://offers.monlix.com/?appid={app_id}&userid={user_id}",
    active: true,
    priority: 10,
  },
  {
    id: "revu",
    name: "Revenue Universe",
    slug: "revu",
    description: "Surveys and premium offers",
    logo: "/images/offerwalls/revu.png",
    color: "#009688",
    bgGradient: "from-teal-500/20 to-teal-600/10",
    minPayout: 0,
    conversionRate: 900,
    features: ["Premium surveys", "Bonus offers", "Quick payout"],
    url: "https://wall.revenueuniverse.com/{app_id}/{user_id}",
    active: true,
    priority: 11,
  },
  {
    id: "adgem",
    name: "AdGem",
    slug: "adgem",
    description: "Mobile offers and game downloads",
    logo: "/images/offerwalls/adgem.png",
    color: "#FF5722",
    bgGradient: "from-deep-orange-500/20 to-deep-orange-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Mobile offers", "Game downloads", "Quick rewards"],
    url: "https://adgem.com/wall/{player_id}/{user_id}",
    active: true,
    priority: 12,
  },
  {
    id: "pollfish",
    name: "Pollfish",
    slug: "pollfish",
    description: "Short surveys with fast rewards",
    logo: "/images/offerwalls/pollfish.png",
    color: "#795548",
    bgGradient: "from-brown-500/20 to-brown-600/10",
    minPayout: 0,
    conversionRate: 1000,
    features: ["Short surveys", "Quick rewards", "Mobile friendly"],
    url: "https://www.pollfish.com/show/{api_key}/{user_id}",
    active: true,
    priority: 13,
  },
  {
    id: "theoremreach",
    name: "TheoremReach",
    slug: "theoremreach",
    description: "Quality surveys with good payouts",
    logo: "/images/offerwalls/theoremreach.png",
    color: "#607D8B",
    bgGradient: "from-slate-500/20 to-slate-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Quality surveys", "Good payouts", "Fast credit"],
    url: "https://theoremreach.com/respondent_entry/{api_key}/{user_id}",
    active: true,
    priority: 14,
  },
  {
    id: "hangmyads",
    name: "HangMyAds",
    slug: "hang-my-ads",
    description: "High-converting CPA offers with great payouts",
    logo: "/images/offerwalls/hangmyads.png",
    color: "#8B5CF6",
    bgGradient: "from-violet-500/20 to-violet-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["CPA offers", "High payouts", "Fast credit"],
    url: "https://hangmyads.com/wall/{pub_id}/{user_id}",
    active: true,
    priority: 15,
  },
  {
    id: "offerwallme",
    name: "Offerwall.me",
    slug: "offerwall-me",
    description: "Multi-network aggregator with many offers",
    logo: "/images/offerwalls/offerwallme.png",
    color: "#10B981",
    bgGradient: "from-emerald-500/20 to-emerald-600/10",
    minPayout: 0,
    conversionRate: 900,
    features: ["Multi-network", "Many offers", "Easy tasks"],
    url: "https://offerwall.me/wall/{api_key}/{user_id}",
    active: true,
    priority: 16,
  },
  {
    id: "bicotasks",
    name: "BicoTasks",
    slug: "bicotasks",
    description: "Task-based earning with daily bonuses",
    logo: "/images/offerwalls/bicotasks.png",
    color: "#F59E0B",
    bgGradient: "from-yellow-500/20 to-yellow-600/10",
    minPayout: 0,
    conversionRate: 850,
    features: ["Daily tasks", "Bonus offers", "Quick pay"],
    url: "https://bicotasks.com/wall/{pub_id}/{user_id}",
    active: true,
    priority: 17,
  },
  {
    id: "mmwall",
    name: "MM Wall",
    slug: "mm-wall",
    description: "Simple tasks for quick earnings",
    logo: "/images/offerwalls/mmwall.png",
    color: "#EC4899",
    bgGradient: "from-pink-500/20 to-pink-600/10",
    minPayout: 0,
    conversionRate: 800,
    features: ["Simple tasks", "Quick earnings", "Beginner friendly"],
    url: "https://mmwall.io/wall/{api_key}/{user_id}",
    active: true,
    priority: 18,
  },
  {
    id: "adscend",
    name: "Adscend Media",
    slug: "adscend",
    description: "Premium CPA network with exclusive offers",
    logo: "/images/offerwalls/adscend.png",
    color: "#6366F1",
    bgGradient: "from-indigo-500/20 to-indigo-600/10",
    minPayout: 0,
    conversionRate: 950,
    features: ["Premium CPA", "Exclusive offers", "Reliable tracking"],
    url: "https://adscendmedia.com/wall/{pub_id}/{user_id}",
    active: true,
    priority: 19,
  },
  {
    id: "cpalead",
    name: "CPALead",
    slug: "cpalead",
    description: "Trusted CPA network with many offers",
    logo: "/images/offerwalls/cpalead.png",
    color: "#DC2626",
    bgGradient: "from-red-500/20 to-red-600/10",
    minPayout: 0,
    conversionRate: 900,
    features: ["CPA offers", "Trusted network", "Many options"],
    url: "https://cpalead.com/wall/{gateway_id}/{user_id}",
    active: true,
    priority: 20,
  },
  {
    id: "minutestaff",
    name: "Minutestaff",
    slug: "minutestaff",
    description: "Quick micro-tasks for instant rewards",
    logo: "/images/offerwalls/minutestaff.png",
    color: "#14B8A6",
    bgGradient: "from-teal-500/20 to-teal-600/10",
    minPayout: 0,
    conversionRate: 850,
    features: ["Micro-tasks", "Instant rewards", "Quick earnings"],
    url: "https://minutestaff.com/wall/{pub_id}/{user_id}",
    active: true,
    priority: 21,
  },
]

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get("slug")
    const includeStats = searchParams.get("stats") === "true"

    // Get user session
    const { data: { user } } = await supabase.auth.getUser()

    // If requesting a specific offerwall
    if (slug) {
      const offerwall = OFFERWALLS.find((o) => o.slug === slug || o.id === slug)
      if (!offerwall) {
        return NextResponse.json({ error: "Offerwall not found" }, { status: 404 })
      }

      let stats = null
      if (includeStats) {
        // Get stats for this specific offerwall
        const { data: completions } = await supabase
          .from("transactions")
          .select("amount")
          .eq("type", "offerwall")
          .eq("status", "completed")
          .ilike("description", `%${offerwall.name}%`)

        const totalPaid = completions?.reduce((sum, tx) => sum + tx.amount, 0) || 0
        const completionCount = completions?.length || 0

        // Get user's earnings from this offerwall
        let userEarnings = 0
        if (user) {
          const { data: userCompletions } = await supabase
            .from("transactions")
            .select("amount")
            .eq("user_id", user.id)
            .eq("type", "offerwall")
            .eq("status", "completed")
            .ilike("description", `%${offerwall.name}%`)

          userEarnings = userCompletions?.reduce((sum, tx) => sum + tx.amount, 0) || 0
        }

        stats = {
          total_paid: totalPaid,
          completion_count: completionCount,
          user_earnings: userEarnings,
        }
      }

      return NextResponse.json({ offerwall, stats })
    }

    // Get all offerwalls with optional stats
    const offerwallsWithStats = await Promise.all(
      OFFERWALLS.filter((o) => o.active).map(async (offerwall) => {
        if (!includeStats) {
          return { ...offerwall, stats: null }
        }

        // Get aggregated stats from database
        const { data: completions } = await supabase
          .from("transactions")
          .select("amount")
          .eq("type", "offerwall")
          .eq("status", "completed")
          .ilike("description", `%${offerwall.name}%`)

        const totalPaid = completions?.reduce((sum, tx) => sum + tx.amount, 0) || 0
        const completionCount = completions?.length || 0

        // Get user's earnings from this offerwall
        let userEarnings = 0
        let userCompletions = 0
        if (user) {
          const { data: userTx } = await supabase
            .from("transactions")
            .select("amount")
            .eq("user_id", user.id)
            .eq("type", "offerwall")
            .eq("status", "completed")
            .ilike("description", `%${offerwall.name}%`)

          userEarnings = userTx?.reduce((sum, tx) => sum + tx.amount, 0) || 0
          userCompletions = userTx?.length || 0
        }

        return {
          ...offerwall,
          stats: {
            total_paid: totalPaid,
            completion_count: completionCount,
            user_earnings: userEarnings,
            user_completions: userCompletions,
          },
        }
      })
    )

    // Sort by priority
    offerwallsWithStats.sort((a, b) => a.priority - b.priority)

    // Get platform-wide stats
    const { data: allOfferwallTx } = await supabase
      .from("transactions")
      .select("amount")
      .eq("type", "offerwall")
      .eq("status", "completed")

    const platformStats = {
      total_paid_all_offerwalls: allOfferwallTx?.reduce((sum, tx) => sum + tx.amount, 0) || 0,
      total_completions: allOfferwallTx?.length || 0,
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

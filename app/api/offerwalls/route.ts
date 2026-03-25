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
    id: "cpx",
    name: "CPX Research",
    slug: "cpx-research",
    description: "Complete surveys and earn rewards instantly",
    logo: "/images/offerwalls/cpx.png",
    color: "#00C853",
    bgGradient: "from-green-500/20 to-green-600/10",
    minPayout: 0,
    conversionRate: 1000, // 1000 satoshi per dollar
    features: ["Instant payouts", "Many surveys available", "Mobile friendly"],
    url: "https://offers.cpx-research.com/?app_id={app_id}&ext_user_id={user_id}",
    active: true,
    priority: 1,
  },
  {
    id: "offertoro",
    name: "OfferToro",
    slug: "offertoro",
    description: "Download apps and complete offers for rewards",
    logo: "/images/offerwalls/offertoro.png",
    color: "#FF6B00",
    bgGradient: "from-orange-500/20 to-orange-600/10",
    minPayout: 0,
    conversionRate: 900,
    features: ["App downloads", "Video rewards", "Easy tasks"],
    url: "https://www.offertoro.com/ifr/show/{pub_id}/{user_id}/0",
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
    features: ["Time-based rewards", "Content viewing", "Easy earnings"],
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

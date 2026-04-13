import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, getUser } from "@/lib/supabase/server"

// Demo PTC ads for when database isn't connected
const DEMO_PTC_ADS = [
  { id: "demo-1", title: "Bitcoin News Today", description: "Stay updated with the latest Bitcoin news and market analysis", url: "https://bitcoin.org", duration_seconds: 30, reward_satoshis: 5 },
  { id: "demo-2", title: "Learn About Ethereum", description: "Discover the world of Ethereum and smart contracts", url: "https://ethereum.org", duration_seconds: 30, reward_satoshis: 5 },
  { id: "demo-3", title: "Crypto Trading Guide", description: "Essential tips for cryptocurrency trading beginners", url: "https://coinmarketcap.com", duration_seconds: 30, reward_satoshis: 5 },
  { id: "demo-4", title: "Blockchain Technology", description: "Understanding blockchain technology and its applications", url: "https://blockchain.com", duration_seconds: 30, reward_satoshis: 5 },
  { id: "demo-5", title: "DeFi Explained", description: "Introduction to Decentralized Finance and yield farming", url: "https://defipulse.com", duration_seconds: 30, reward_satoshis: 5 },
  { id: "demo-6", title: "Binance Exchange", description: "World largest cryptocurrency exchange platform", url: "https://binance.com", duration_seconds: 45, reward_satoshis: 8 },
  { id: "demo-7", title: "Coinbase Learn", description: "Free crypto education and earn opportunities", url: "https://coinbase.com", duration_seconds: 45, reward_satoshis: 8 },
  { id: "demo-8", title: "Crypto Wallet Security", description: "Best practices for securing your crypto assets", url: "https://ledger.com", duration_seconds: 45, reward_satoshis: 8 },
  { id: "demo-9", title: "NFT Marketplace", description: "Explore the world of digital collectibles and NFTs", url: "https://opensea.io", duration_seconds: 45, reward_satoshis: 8 },
  { id: "demo-10", title: "Mining Guide 2024", description: "Complete guide to cryptocurrency mining", url: "https://whattomine.com", duration_seconds: 45, reward_satoshis: 8 },
  { id: "demo-11", title: "Trezor Hardware Wallet", description: "Keep your crypto safe with hardware wallet", url: "https://trezor.io", duration_seconds: 60, reward_satoshis: 12 },
  { id: "demo-12", title: "CoinGecko Analytics", description: "Track crypto prices and market data", url: "https://coingecko.com", duration_seconds: 60, reward_satoshis: 12 },
  { id: "demo-13", title: "Lightning Network", description: "Fast and cheap Bitcoin transactions explained", url: "https://lightning.network", duration_seconds: 60, reward_satoshis: 12 },
  { id: "demo-14", title: "Staking Rewards", description: "Earn passive income by staking your crypto", url: "https://stakingrewards.com", duration_seconds: 60, reward_satoshis: 12 },
  { id: "demo-15", title: "Crypto Tax Guide", description: "Understanding cryptocurrency taxation and reporting", url: "https://koinly.io", duration_seconds: 60, reward_satoshis: 12 },
]

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check for demo ads first
    if (id.startsWith("demo-")) {
      const demoAd = DEMO_PTC_ADS.find(ad => ad.id === id)
      if (demoAd) {
        return NextResponse.json({ ad: demoAd, demo: true })
      }
    }

    const user = await getUser()

    if (!user) {
      // Allow demo ads without auth
      const demoAd = DEMO_PTC_ADS.find(ad => ad.id === id) || DEMO_PTC_ADS[0]
      return NextResponse.json({ ad: demoAd, demo: true })
    }

    const adminSupabase = createAdminClient()

    if (!adminSupabase) {
      // Return demo ad if no database
      const demoAd = DEMO_PTC_ADS.find(ad => ad.id === id) || DEMO_PTC_ADS[0]
      return NextResponse.json({ ad: demoAd, demo: true })
    }

    // Get the specific ad
    const { data: ad, error } = await adminSupabase
      .from("ptc_ads")
      .select("id, title, description, url, duration_seconds, reward_satoshis")
      .eq("id", id)
      .eq("is_active", true)
      .eq("is_approved", true)
      .gt("remaining_budget_satoshis", 0)
      .single()

    if (error || !ad) {
      return NextResponse.json({ error: "Ad not found or no longer available" }, { status: 404 })
    }

    // Check if user already watched this ad today
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const { data: existingView } = await adminSupabase
      .from("ptc_views")
      .select("id")
      .eq("user_id", user.id)
      .eq("ad_id", id)
      .gte("created_at", today.toISOString())
      .single()

    if (existingView) {
      return NextResponse.json({ error: "You already watched this ad today" }, { status: 400 })
    }

    return NextResponse.json({ ad })
  } catch (error) {
    console.error("Error fetching PTC ad:", error)
    return NextResponse.json({ error: "Failed to fetch ad" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// All the env vars we want to track status for
const TRACKED_ENV_VARS = [
  // Ad Networks
  "GOOGLE_ADSENSE_ID",
  "COINTRAFFIC_ZONE_ID",
  "MEDIANET_ID",
  "HILLTOPADS_ID",
  "ADSTERRA_ID",
  "PROPELLERADS_ID",
  "TRAFFICSTARS_ID",
  "ADSKEEPER_ID",
  "AADS_ID",
  "COINZILLA_ZONE",
  "BITSMEDIA_ID",
  "BITMEDIA_ID",

  // Payment Processors
  "FAUCETPAY_API_KEY",
  "CCPAYMENT_APP_ID",
  "CCPAYMENT_APP_SECRET",
  "CWALLET_API_KEY",

  // Security
  "TURNSTILE_SECRET_KEY",
  "HCAPTCHA_SECRET",

  // Offerwall Public Keys
  "CCXUA_API_KEY",
  "NEXT_PUBLIC_CCXUA_API_KEY",
  "NEXT_PUBLIC_CPX_APP_ID",
  "NEXT_PUBLIC_TOROX_PUB_ID",
  "NEXT_PUBLIC_ADGATE_WALL_CODE",
  "NEXT_PUBLIC_LOOTABLY_PLACEMENT_ID",
  "NEXT_PUBLIC_BITLABS_TOKEN",
  "NEXT_PUBLIC_TIMEWALL_KEY",
  "NEXT_PUBLIC_AYET_ADSLOT",
  "NEXT_PUBLIC_ADGEM_PLAYER_ID",

  // Offerwall Secret Keys
  "CCXUA_SECRET_KEY",
  "CPX_SECRET_KEY",
  "TOROX_SECRET_KEY",
  "LOOTABLY_SECRET_KEY",
  "ADGATE_SECRET_KEY",
  "BITLABS_SECRET_KEY",
  "TIMEWALL_SECRET_KEY",
  "AYET_STUDIOS_SECRET_KEY",
  "MM_WALL_SECRET_KEY",
  "OFFERWALLME_SECRET_KEY",
  "BICOTASKS_SECRET_KEY",
  "ADSCEND_SECRET_KEY",
  "HANG_MY_ADS_SECRET_KEY",
  "NOTIK_SECRET_KEY",
  "MONLIX_APP_ID",
  "MONLIX_SECRET_KEY",
  "HIDEOUT_SECRET_KEY",

  // Cron Jobs
  "CRON_SECRET",
]

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Check if user is admin
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ configured: [], lastUpdated: {} })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ configured: [], lastUpdated: {} })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      return NextResponse.json({ configured: [], lastUpdated: {} })
    }

    // Check which env vars are set
    const configured = TRACKED_ENV_VARS.filter((key) => {
      const value = process.env[key]
      return value && value.trim().length > 0
    })

    return NextResponse.json({
      configured,
      lastUpdated: {}, // We don't track timestamps for env vars
    })
  } catch (error) {
    console.error("[Env Vars Status] Error:", error)
    return NextResponse.json({ configured: [], lastUpdated: {} })
  }
}

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Always read env vars fresh at request time so newly added Vercel env
// variables show up immediately without a redeploy-triggered cache miss.
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"
export const runtime = "nodejs"

interface EnvVarConfig {
  key: string
  category: "database" | "payment" | "api" | "security" | "shortlink" | "other"
  isSecret: boolean
  description: string
}

const ENV_VAR_CONFIG: EnvVarConfig[] = [
  // ===== DATABASE =====
  { key: "NEXT_PUBLIC_SUPABASE_URL", category: "database", isSecret: false, description: "Supabase project URL" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", category: "database", isSecret: false, description: "Supabase anonymous/public key" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", category: "database", isSecret: true, description: "Supabase service role key (admin access)" },
  { key: "SUPABASE_JWT_SECRET", category: "database", isSecret: true, description: "Supabase JWT secret for token verification" },
  { key: "KV_REST_API_URL", category: "database", isSecret: false, description: "Vercel KV / Upstash Redis REST URL" },
  { key: "KV_REST_API_TOKEN", category: "database", isSecret: true, description: "Vercel KV / Upstash Redis REST Token" },

  // ===== PAYMENT =====
  { key: "FAUCETPAY_API_KEY", category: "payment", isSecret: true, description: "FaucetPay API key for crypto withdrawals" },
  { key: "CCPAYMENT_APP_ID", category: "payment", isSecret: false, description: "CCPayment App ID for deposits" },
  { key: "CCPAYMENT_APP_SECRET", category: "payment", isSecret: true, description: "CCPayment App Secret for deposits" },

  // ===== APP CONFIG =====
  { key: "NEXT_PUBLIC_APP_URL", category: "other", isSecret: false, description: "Public app URL (e.g., https://faucero.com)" },
  { key: "NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL", category: "other", isSecret: false, description: "OAuth redirect URL for development" },

  // ===== OFFERWALL PUBLIC KEYS =====
  { key: "CCXUA_API_KEY", category: "api", isSecret: true, description: "c.cx.ua API key (required for offerwall URL)" },
  { key: "CCXUA_SECRET_KEY", category: "api", isSecret: true, description: "c.cx.ua secret key for postback signature verification" },
  { key: "NEXT_PUBLIC_CPX_APP_ID", category: "api", isSecret: false, description: "CPX Research App ID" },
  { key: "NEXT_PUBLIC_BITLABS_TOKEN", category: "api", isSecret: false, description: "BitLabs API Token" },
  { key: "NEXT_PUBLIC_LOOTABLY_PLACEMENT_ID", category: "api", isSecret: false, description: "Lootably Placement ID" },
  { key: "NEXT_PUBLIC_ADGATE_WALL_CODE", category: "api", isSecret: false, description: "AdGate Media Wall Code" },
  { key: "NEXT_PUBLIC_TOROX_PUB_ID", category: "api", isSecret: false, description: "Torox Publisher ID" },
  { key: "NEXT_PUBLIC_TIMEWALL_KEY", category: "api", isSecret: false, description: "Timewall API Key" },
  { key: "NEXT_PUBLIC_AYET_ADSLOT", category: "api", isSecret: false, description: "ayeT-Studios Ad Slot ID" },
  { key: "NEXT_PUBLIC_ADGEM_PLAYER_ID", category: "api", isSecret: false, description: "AdGem Player ID" },

  // ===== OFFERWALL SECRET KEYS (for postback verification) =====
  { key: "CPX_SECRET_KEY", category: "api", isSecret: true, description: "CPX Research postback secret key" },
  { key: "TOROX_SECRET_KEY", category: "api", isSecret: true, description: "Torox postback secret key" },
  { key: "LOOTABLY_SECRET_KEY", category: "api", isSecret: true, description: "Lootably postback secret key" },
  { key: "ADGATE_SECRET_KEY", category: "api", isSecret: true, description: "AdGate Media postback secret key" },
  { key: "BITLABS_SECRET_KEY", category: "api", isSecret: true, description: "BitLabs postback secret key" },
  { key: "TIMEWALL_SECRET_KEY", category: "api", isSecret: true, description: "Timewall postback secret key" },
  { key: "AYET_STUDIOS_SECRET_KEY", category: "api", isSecret: true, description: "ayeT-Studios postback secret key" },
  { key: "MM_WALL_SECRET_KEY", category: "api", isSecret: true, description: "MM Wall postback secret key" },
  { key: "OFFERWALLME_SECRET_KEY", category: "api", isSecret: true, description: "Offerwall.me postback secret key" },
  { key: "BICOTASKS_SECRET_KEY", category: "api", isSecret: true, description: "BicoTasks postback secret key" },
  { key: "ADSCEND_SECRET_KEY", category: "api", isSecret: true, description: "Adscend Media postback secret key" },
  { key: "HANG_MY_ADS_SECRET_KEY", category: "api", isSecret: true, description: "Hang My Ads postback secret key" },
  { key: "NOTIK_SECRET_KEY", category: "api", isSecret: true, description: "Notik postback secret key" },
  { key: "MONLIX_APP_ID", category: "api", isSecret: false, description: "Monlix App ID" },
  { key: "MONLIX_SECRET_KEY", category: "api", isSecret: true, description: "Monlix postback secret key" },
  { key: "HIDEOUT_SECRET_KEY", category: "api", isSecret: true, description: "Hideout.tv postback secret key" },

  // ===== CRON JOB SECURITY =====
  { key: "CRON_SECRET", category: "security", isSecret: true, description: "Secret key for cron job authentication" },

  // ===== SHORTLINK PROVIDERS =====
  { key: "SHORTLINK_PROVIDER",  category: "shortlink", isSecret: false, description: "Active provider (shrinkme | shrinkearn | exeio | fclc | gplinks | ouoio | linkvertise | shortest | shareus | stfly | cuty | adfocus | linkpays | clk)" },
  { key: "SHRINKME_API_KEY",    category: "shortlink", isSecret: true, description: "ShrinkMe.io API Key — highest-paying URL shortener" },
  { key: "SHRINKEARN_API_KEY",  category: "shortlink", isSecret: true, description: "ShrinkEarn API Key — trusted shortener since 2018" },
  { key: "EXEIO_API_KEY",       category: "shortlink", isSecret: true, description: "Exe.io API Key — Bitcoin payouts available" },
  { key: "FCLC_API_KEY",        category: "shortlink", isSecret: true, description: "FC.LC API Key — fast redirect network" },
  { key: "GPLINKS_API_KEY",     category: "shortlink", isSecret: true, description: "GPLinks.in API Key — India-friendly shortener" },
  { key: "OUOIO_API_KEY",       category: "shortlink", isSecret: true, description: "Ouo.io API Key — fast & reliable redirects" },
  { key: "LINKVERTISE_API_KEY", category: "shortlink", isSecret: true, description: "Linkvertise API Token — premium rewards platform" },
  { key: "SHORTEST_API_KEY",    category: "shortlink", isSecret: true, description: "Shorte.st Public API Token — veteran shortlink network" },
  { key: "SHAREUS_API_KEY",     category: "shortlink", isSecret: true, description: "ShareUs.io API Key — crypto-friendly shortener" },
  { key: "STFLY_API_KEY",       category: "shortlink", isSecret: true, description: "Stfly.io API Key — free, fast shortener" },
  { key: "CUTY_API_KEY",        category: "shortlink", isSecret: true, description: "Cuty.io API Key — multi-tier earnings" },
  { key: "ADFOCUS_API_KEY",     category: "shortlink", isSecret: true, description: "AdFoc.us API Key — daily payouts shortener" },
  { key: "LINKPAYS_API_KEY",    category: "shortlink", isSecret: true, description: "LinkPays.in API Key — worldwide audience" },
  { key: "CLK_API_KEY",         category: "shortlink", isSecret: true, description: "Clk.sh API Key — reliable, established network" },

  // ===== SECURITY - VPN/PROXY DETECTION =====
  { key: "IP_API_KEY", category: "security", isSecret: true, description: "IP-API.com API Key for geolocation" },
  { key: "VPNAPI_KEY", category: "security", isSecret: true, description: "VPNAPI.io Key for VPN detection" },
  { key: "IPQUALITYSCORE_API_KEY", category: "security", isSecret: true, description: "IPQualityScore API Key for fraud detection" },
  { key: "PROXYCHECK_API_KEY", category: "security", isSecret: true, description: "ProxyCheck.io API Key" },
  { key: "GETIPINTEL_EMAIL", category: "security", isSecret: false, description: "GetIPIntel contact email" },
  { key: "IPHUB_API_KEY", category: "security", isSecret: true, description: "IPHub API Key" },
  { key: "IP2LOCATION_API_KEY", category: "security", isSecret: true, description: "IP2Location API Key" },
  { key: "ABUSEIPDB_API_KEY", category: "security", isSecret: true, description: "AbuseIPDB API Key" },
  { key: "SHODAN_API_KEY", category: "security", isSecret: true, description: "Shodan API Key" },
  { key: "IPINFO_TOKEN", category: "security", isSecret: true, description: "IPInfo.io Token" },
  { key: "BIGDATACLOUD_KEY", category: "security", isSecret: true, description: "BigDataCloud API Key" },
  { key: "SCAMALYTICS_API_KEY", category: "security", isSecret: true, description: "Scamalytics API Key" },
  { key: "FRAUDGUARD_USERNAME", category: "security", isSecret: false, description: "FraudGuard Username" },
  { key: "FRAUDGUARD_PASSWORD", category: "security", isSecret: true, description: "FraudGuard Password" },
  { key: "IP2PROXY_API_KEY", category: "security", isSecret: true, description: "IP2Proxy API Key" },
  { key: "DBIP_API_KEY", category: "security", isSecret: true, description: "DB-IP API Key" },
  { key: "SPUR_TOKEN", category: "security", isSecret: true, description: "Spur.us Token for VPN detection" },

  // ===== SECURITY - CAPTCHA & TOKENS =====
  { key: "TURNSTILE_SECRET_KEY", category: "security", isSecret: true, description: "Cloudflare Turnstile secret key" },
  { key: "NEXT_PUBLIC_TURNSTILE_SITE_KEY", category: "security", isSecret: false, description: "Cloudflare Turnstile site key" },
  { key: "NEXT_PUBLIC_HCAPTCHA_SITE_KEY", category: "security", isSecret: false, description: "hCaptcha site key" },
  { key: "CSRF_SECRET", category: "security", isSecret: true, description: "CSRF protection secret" },
  { key: "CHALLENGE_SECRET", category: "security", isSecret: true, description: "Challenge verification secret" },
  { key: "BALANCE_INTEGRITY_SECRET", category: "security", isSecret: true, description: "Balance integrity verification secret" },
  { key: "IP_HASH_SALT", category: "security", isSecret: true, description: "Salt for IP address hashing" },

  // ===== EMAIL =====
  { key: "RESEND_API_KEY", category: "api", isSecret: true, description: "Resend API Key for email sending" },
  { key: "EMAIL_FROM", category: "api", isSecret: false, description: "Default from email address" },
  { key: "SUPPORT_EMAIL", category: "api", isSecret: false, description: "Support email address" },
]

export async function GET() {
  try {
    // Check if user is admin
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Check which env vars are set
    const envVars = ENV_VAR_CONFIG.map((config) => ({
      ...config,
      value: "", // Never expose actual values
      isSet: !!process.env[config.key],
    }))

    return NextResponse.json({ envVars })
  } catch (error) {
    console.error("[Env Vars Check] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

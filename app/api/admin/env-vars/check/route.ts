import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface EnvVarConfig {
  key: string
  category: "database" | "payment" | "api" | "security" | "other"
  isSecret: boolean
  description: string
}

const ENV_VAR_CONFIG: EnvVarConfig[] = [
  // Database
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    category: "database",
    isSecret: false,
    description: "Supabase project URL",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    category: "database",
    isSecret: false,
    description: "Supabase anonymous/public key",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    category: "database",
    isSecret: true,
    description: "Supabase service role key (admin access)",
  },
  // Payment
  {
    key: "FAUCETPAY_API_KEY",
    category: "payment",
    isSecret: true,
    description: "FaucetPay API key for withdrawals",
  },
  // API Keys
  {
    key: "NEXT_PUBLIC_CPX_APP_ID",
    category: "api",
    isSecret: false,
    description: "CPX Research App ID",
  },
  {
    key: "NEXT_PUBLIC_BITLABS_TOKEN",
    category: "api",
    isSecret: false,
    description: "BitLabs API Token",
  },
  {
    key: "NEXT_PUBLIC_LOOTABLY_PLACEMENT_ID",
    category: "api",
    isSecret: false,
    description: "Lootably Placement ID",
  },
  {
    key: "NEXT_PUBLIC_ADGATE_WALL_CODE",
    category: "api",
    isSecret: false,
    description: "AdGate Media Wall Code",
  },
  {
    key: "NEXT_PUBLIC_TOROX_PUB_ID",
    category: "api",
    isSecret: false,
    description: "Torox Publisher ID",
  },
  {
    key: "NEXT_PUBLIC_TIMEWALL_KEY",
    category: "api",
    isSecret: false,
    description: "Timewall API Key",
  },
  {
    key: "NEXT_PUBLIC_AYET_ADSLOT",
    category: "api",
    isSecret: false,
    description: "ayeT-Studios Ad Slot ID",
  },
  // Security
  {
    key: "UPSTASH_REDIS_REST_URL",
    category: "security",
    isSecret: false,
    description: "Upstash Redis REST URL for rate limiting",
  },
  {
    key: "UPSTASH_REDIS_REST_TOKEN",
    category: "security",
    isSecret: true,
    description: "Upstash Redis REST Token",
  },
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

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export interface SupabaseStatus {
  connected: boolean
  status: "connected" | "degraded" | "disconnected" | "unconfigured"
  latency: number | null
  message: string
  timestamp: string
  checks: {
    envVars: boolean
    clientCreation: boolean
    dbQuery: boolean
  }
}

export async function GET() {
  const timestamp = new Date().toISOString()
  const checks = {
    envVars: false,
    clientCreation: false,
    dbQuery: false,
  }

  // Check 1: Environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
    return NextResponse.json<SupabaseStatus>({
      connected: false,
      status: "unconfigured",
      latency: null,
      message: "Supabase environment variables are not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      timestamp,
      checks,
    })
  }

  checks.envVars = true

  // Check 2: Client creation
  let adminClient: ReturnType<typeof createAdminClient>
  try {
    adminClient = createAdminClient()
    if (!adminClient) {
      return NextResponse.json<SupabaseStatus>({
        connected: false,
        status: "disconnected",
        latency: null,
        message: "Failed to create Supabase client. Check your API keys.",
        timestamp,
        checks,
      })
    }
    checks.clientCreation = true
  } catch {
    return NextResponse.json<SupabaseStatus>({
      connected: false,
      status: "disconnected",
      latency: null,
      message: "Error creating Supabase client.",
      timestamp,
      checks,
    })
  }

  // Check 3: Database query with latency measurement
  const dbStart = Date.now()
  try {
    const { error } = await adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .limit(1)

    const latency = Date.now() - dbStart

    if (error) {
      // Table might not exist but Supabase is reachable
      if (error.code === "42P01") {
        checks.dbQuery = true
        return NextResponse.json<SupabaseStatus>({
          connected: true,
          status: "degraded",
          latency,
          message: "Supabase is connected but the profiles table does not exist. Run database migrations.",
          timestamp,
          checks,
        })
      }

      return NextResponse.json<SupabaseStatus>({
        connected: false,
        status: "degraded",
        latency,
        message: `Database query error: ${error.message}`,
        timestamp,
        checks,
      })
    }

    checks.dbQuery = true

    const status: SupabaseStatus["status"] = latency > 2000 ? "degraded" : "connected"

    return NextResponse.json<SupabaseStatus>({
      connected: true,
      status,
      latency,
      message: status === "degraded"
        ? `Supabase is responding slowly (${latency}ms).`
        : `Supabase is connected and healthy (${latency}ms).`,
      timestamp,
      checks,
    })
  } catch {
    const latency = Date.now() - dbStart
    return NextResponse.json<SupabaseStatus>({
      connected: false,
      status: "disconnected",
      latency,
      message: "Cannot reach Supabase. The service may be temporarily unavailable.",
      timestamp,
      checks,
    })
  }
}

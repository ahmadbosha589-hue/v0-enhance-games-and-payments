import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export type SupabaseHealthStatus = "connected" | "degraded" | "disconnected" | "unconfigured"

export interface SupabaseStatus {
  connected: boolean
  status: SupabaseHealthStatus
  latency: number | null
  message: string
  timestamp: string
  checks: {
    envVars: boolean
    clientCreation: boolean
    dbQuery: boolean
  }
  details?: {
    tableCount?: number
    lastSuccessfulQuery?: string
  }
}

function jsonResponse(data: SupabaseStatus, cacheSeconds = 10) {
  return NextResponse.json<SupabaseStatus>(data, {
    headers: {
      "Cache-Control": `private, max-age=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`,
    },
  })
}

export async function GET() {
  const admin = await requireAdmin(["admin", "superadmin"])
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

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
    return jsonResponse({
      connected: false,
      status: "unconfigured",
      latency: null,
      message: "Supabase environment variables are not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      timestamp,
      checks,
    }, 30)
  }

  checks.envVars = true

  // Check 2: Client creation
  let adminClient: ReturnType<typeof requireAdminClient>
  try {
    adminClient = requireAdminClient()
    checks.clientCreation = true
  } catch {
    return jsonResponse({
      connected: false,
      status: "disconnected",
      latency: null,
      message: "Error creating Supabase client.",
      timestamp,
      checks,
    })
  }

  // Check 3: Database query with latency measurement and timeout
  const dbStart = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 6000)

  try {
    const { error } = await adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .limit(1)
      .abortSignal(controller.signal)

    clearTimeout(timeoutId)
    const latency = Date.now() - dbStart

    if (error) {
      // Table might not exist but Supabase is reachable
      if (error.code === "42P01") {
        checks.dbQuery = true
        return jsonResponse({
          connected: true,
          status: "degraded",
          latency,
          message: "Supabase is connected but the profiles table does not exist. Run database migrations.",
          timestamp,
          checks,
        })
      }

      // Permission error — client can reach Supabase but RLS or key issue
      if (error.code === "42501" || error.message?.includes("permission denied")) {
        checks.dbQuery = true
        return jsonResponse({
          connected: true,
          status: "degraded",
          latency,
          message: "Supabase is connected but query permissions are restricted. Check RLS policies.",
          timestamp,
          checks,
        })
      }

      return jsonResponse({
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

    // Try to get additional details
    let tableCount: number | undefined
    try {
      const { count } = await adminClient
        .from("profiles")
        .select("*", { count: "exact", head: true })
      tableCount = count ?? undefined
    } catch {
      // Non-critical, continue without count
    }

    return jsonResponse({
      connected: true,
      status,
      latency,
      message: status === "degraded"
        ? `Supabase is responding slowly (${latency}ms).`
        : `Supabase is connected and healthy (${latency}ms).`,
      timestamp,
      checks,
      details: {
        tableCount,
        lastSuccessfulQuery: new Date().toISOString(),
      },
    })
  } catch (err) {
    clearTimeout(timeoutId)
    const latency = Date.now() - dbStart
    const isTimeout = err instanceof DOMException && err.name === "AbortError"

    return jsonResponse({
      connected: false,
      status: "disconnected",
      latency,
      message: isTimeout
        ? `Supabase health check timed out after ${latency}ms.`
        : "Cannot reach Supabase. The service may be temporarily unavailable.",
      timestamp,
      checks,
    })
  }
}

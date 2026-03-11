import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { logHoneypotProbeRequest } from "@/lib/security/honeypot-logger"

export const dynamic = "force-dynamic"

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy"
  timestamp: string
  version: string
  checks: {
    database: { status: string; latency?: number }
    auth: { status: string }
  }
  uptime: number
}

const startTime = Date.now()

export async function GET() {
  // Log control probe for fortress verification
  // This endpoint should ALWAYS be reachable - if not, it indicates network issues
  await logHoneypotProbeRequest("ctrl_health").catch(() => {})
  
  const checks: HealthCheck["checks"] = {
    database: { status: "unknown" },
    auth: { status: "unknown" },
  }

  let overallStatus: HealthCheck["status"] = "healthy"

  // Check database
  try {
    const supabase = await createClient()
    const dbStart = Date.now()
    const { error } = await supabase.from("profiles").select("id").limit(1)
    const dbLatency = Date.now() - dbStart

    if (error) {
      checks.database = { status: "unhealthy", latency: dbLatency }
      overallStatus = "unhealthy"
    } else {
      checks.database = { status: "healthy", latency: dbLatency }
      if (dbLatency > 1000) {
        overallStatus = "degraded"
      }
    }
  } catch {
    checks.database = { status: "unhealthy" }
    overallStatus = "unhealthy"
  }

  // Check auth service
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.getSession()
    checks.auth = { status: error ? "unhealthy" : "healthy" }
    if (error) overallStatus = overallStatus === "healthy" ? "degraded" : overallStatus
  } catch {
    checks.auth = { status: "unhealthy" }
    overallStatus = overallStatus === "healthy" ? "degraded" : overallStatus
  }

  const response: HealthCheck = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    checks,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  }

  return NextResponse.json(response, {
    status: overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503,
  })
}

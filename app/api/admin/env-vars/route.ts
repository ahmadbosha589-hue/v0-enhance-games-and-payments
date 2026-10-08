import { NextResponse } from "next/server"
import { createClient, getVerifiedUser } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// Note: Environment variables cannot be modified at runtime in a serverless environment.
// This API provides a stub that explains this limitation and suggests proper configuration.
// In production, env vars should be set via:
// - Vercel Dashboard > Project Settings > Environment Variables
// - Or via vercel CLI: vercel env add VARIABLE_NAME

export async function POST(request: Request) {
  try {
    // Check if user is admin
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // SECURITY: LIVE-verified identity (env-var write/delete).
    const user = await getVerifiedUser()

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

    const body = await request.json()
    const { key, value } = body

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 })
    }

    if (!value || typeof value !== "string") {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 })
    }

    // In a serverless environment, we cannot modify env vars at runtime.
    // Return a helpful message explaining how to configure them properly.
    return NextResponse.json({
      success: false,
      message: `Environment variables cannot be modified at runtime. Please configure ${key} via your hosting provider's dashboard (e.g., Vercel Dashboard > Project Settings > Environment Variables).`,
      instructions: [
        "1. Go to your Vercel Dashboard",
        "2. Select your project",
        "3. Go to Settings > Environment Variables",
        `4. Add or update: ${key}`,
        "5. Redeploy your application for changes to take effect",
      ],
    }, { status: 200 })
  } catch (error) {
    console.error("[Env Vars POST] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    // Check if user is admin
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // SECURITY: LIVE-verified identity (env-var write/delete).
    const user = await getVerifiedUser()

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

    const body = await request.json()
    const { key } = body

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 })
    }

    // In a serverless environment, we cannot delete env vars at runtime.
    return NextResponse.json({
      success: false,
      message: `Environment variables cannot be deleted at runtime. Please remove ${key} via your hosting provider's dashboard.`,
      instructions: [
        "1. Go to your Vercel Dashboard",
        "2. Select your project",
        "3. Go to Settings > Environment Variables",
        `4. Find and delete: ${key}`,
        "5. Redeploy your application for changes to take effect",
      ],
    }, { status: 200 })
  } catch (error) {
    console.error("[Env Vars DELETE] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET() {
  try {
    // Check if user is admin
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // SECURITY: LIVE-verified identity (env-var write/delete).
    const user = await getVerifiedUser()

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

    return NextResponse.json({
      message: "Use /api/admin/env-vars/status to check which variables are configured",
      note: "Environment variables are read-only at runtime. Configure them via your hosting provider.",
    })
  } catch (error) {
    console.error("[Env Vars GET] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

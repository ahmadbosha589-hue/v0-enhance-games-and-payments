import { NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// GET /api/transactions?type=offerwall&limit=5
//
// Returns the authenticated user's recent transactions.  Used by the
// "Recent Completions" panel on the offerwalls page (and reusable for
// any other recent-activity widget).
//
// Query params:
//   type   — optional, single value (e.g. "offerwall", "claim", ...)
//            or comma-separated list ("offerwall,ptc,shortlink").
//   status — optional, defaults to "completed".
//   limit  — optional, defaults to 20, capped at 100.
export async function GET(request: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ transactions: [] })
    }

    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get("type")
    const statusParam = searchParams.get("status") || "completed"
    const limitParam = Number.parseInt(searchParams.get("limit") || "20", 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20

    let query = supabase
      .from("transactions")
      .select("id, type, status, amount_satoshis, description, metadata, created_at")
      .eq("user_id", user.id)
      .eq("status", statusParam)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (typeParam) {
      const types = typeParam.split(",").map((t) => t.trim()).filter(Boolean)
      if (types.length === 1) {
        query = query.eq("type", types[0])
      } else if (types.length > 1) {
        query = query.in("type", types)
      }
    }

    const { data, error } = await query
    if (error) {
      console.error("[/api/transactions] query error:", error)
      return NextResponse.json({ transactions: [] })
    }

    return NextResponse.json({ transactions: data || [] })
  } catch (err) {
    console.error("[/api/transactions] unexpected error:", err)
    return NextResponse.json({ transactions: [] })
  }
}

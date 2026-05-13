import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    if (!supabase) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    // Also fetch the profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    return NextResponse.json({
      user,
      profile: profile ?? null
    }, { status: 200 })
  } catch {
    return NextResponse.json({ user: null }, { status: 200 })
  }
}

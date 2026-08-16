import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { profileUpdateSchema } from "@/lib/api/validators"

export async function GET() {
  try {
    const supabase = await createClient()

    // Handle case where Supabase client couldn't be created
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).single()

    if (error || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Calculate next claim time
    let nextClaimAt = null
    let cooldownRemaining = 0

    if (profile.last_claim_at) {
      const lastClaim = new Date(profile.last_claim_at)
      const nextClaim = new Date(lastClaim.getTime() + 5 * 60 * 1000) // 5 minute cooldown

      if (nextClaim > new Date()) {
        nextClaimAt = nextClaim.toISOString()
        cooldownRemaining = Math.ceil((nextClaim.getTime() - Date.now()) / 1000)
      }
    }

    return NextResponse.json({
      profile: {
        ...profile,
        email: user.email,
      },
      claim: {
        nextClaimAt,
        cooldownRemaining,
        canClaim: cooldownRemaining === 0,
      },
    })
  } catch (error) {
    console.error("Get profile error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()

    // Handle case where Supabase client couldn't be created
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = profileUpdateSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json({ error: "Invalid request", details: validatedData.error.issues }, { status: 400 })
    }

    const updates = validatedData.data

    // Check username uniqueness
    if (updates.username) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", updates.username)
        .neq("id", user.id)
        .single()

      if (existing) {
        return NextResponse.json({ error: "Username already taken" }, { status: 400 })
      }
    }

    const { data: profile, error } = await supabase.from("profiles").update(updates).eq("id", user.id).select().single()

    if (error) {
      console.error("Profile update error:", error)
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Update profile error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

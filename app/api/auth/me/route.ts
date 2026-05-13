import { NextResponse } from "next/server"
import { getUser, getProfile } from "@/lib/supabase/server"

// Always re-evaluate per request — the response depends on the session cookie.
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Resilient getUser(): falls back to cookie-decoded session when the
    // Supabase Auth API is slow, so this endpoint never hangs the dashboard
    // or login page on a transient upstream blip.
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    const profile = await getProfile(user.id)

    return NextResponse.json(
      {
        user,
        profile: profile ?? null,
      },
      {
        status: 200,
        headers: {
          // Never let an intermediary cache the auth state of a user.
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
        },
      },
    )
  } catch {
    return NextResponse.json({ user: null }, { status: 200 })
  }
}

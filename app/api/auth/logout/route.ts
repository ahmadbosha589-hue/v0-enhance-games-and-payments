import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 8

const EXPIRED_COOKIE = {
  expires: new Date(0),
  maxAge: 0,
  path: "/",
}

export async function POST() {
  const cookieStore = await cookies()
  let logoutError: string | null = null

  try {
    const supabase = await createClient()
    const result = await Promise.race([
      supabase.auth.signOut({ scope: "global" }),
      new Promise<{ error: Error }>((resolve) =>
        setTimeout(() => resolve({ error: new Error("Supabase sign-out timeout") }), 5000),
      ),
    ])
    if (result.error) logoutError = result.error.message
  } catch (error) {
    logoutError = error instanceof Error ? error.message : "Supabase sign-out failed"
  }

  // Explicitly expire every Supabase auth cookie even if Auth API revocation
  // is unavailable. This prevents a stale httpOnly cookie from restoring the
  // session after the browser redirects.
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-") || cookie.name.includes("supabase")) {
      cookieStore.set(cookie.name, "", EXPIRED_COOKIE)
    }
  }

  return NextResponse.json(
    { success: logoutError === null },
    {
      status: logoutError ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  )
}

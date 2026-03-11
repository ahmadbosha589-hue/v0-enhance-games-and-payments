import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createClient()

  // Verify referral code exists
  const { data: referrer } = await supabase
    .from("profiles")
    .select("id, referral_code")
    .eq("referral_code", code)
    .single()

  if (referrer) {
    // Store referral code in cookie for signup
    const cookieStore = await cookies()
    cookieStore.set("referral_code", code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    })
  }

  redirect("/auth/sign-up")
}

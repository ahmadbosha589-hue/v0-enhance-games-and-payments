import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")

    if (!token) {
      return NextResponse.redirect(new URL("/blog?unsubscribe=invalid", request.url))
    }

    const supabase = await createClient()

    // Find subscriber by token
    const { data: subscriber, error: findError } = await supabase
      .from("newsletter_subscribers")
      .select("id, status")
      .eq("confirmation_token", token)
      .single()

    if (findError || !subscriber) {
      return NextResponse.redirect(new URL("/blog?unsubscribe=invalid", request.url))
    }

    if (subscriber.status === "unsubscribed") {
      return NextResponse.redirect(new URL("/blog?unsubscribe=already", request.url))
    }

    // Update subscription status
    const { error: updateError } = await supabase
      .from("newsletter_subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriber.id)

    if (updateError) {
      console.error("[Newsletter] Unsubscribe error:", updateError)
      return NextResponse.redirect(new URL("/blog?unsubscribe=error", request.url))
    }

    return NextResponse.redirect(new URL("/blog?unsubscribe=success", request.url))
  } catch (error) {
    console.error("[Newsletter] Unsubscribe error:", error)
    return NextResponse.redirect(new URL("/blog?unsubscribe=error", request.url))
  }
}

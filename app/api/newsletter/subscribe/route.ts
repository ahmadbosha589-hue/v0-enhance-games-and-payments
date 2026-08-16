import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email/service"
import { getNewsletterWelcomeTemplate } from "@/lib/email/templates"

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    // Validate email
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email address" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if already subscribed
    const { data: existing } = await supabase
      .from("newsletter_subscribers")
      .select("id, status")
      .eq("email", email.toLowerCase())
      .single()

    if (existing) {
      if (existing.status === "active") {
        return NextResponse.json(
          { success: false, error: "This email is already subscribed" },
          { status: 409 }
        )
      }

      // Reactivate subscription
      const { error: updateError } = await supabase
        .from("newsletter_subscribers")
        .update({
          status: "active",
          unsubscribed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)

      if (updateError) {
        console.error("[Newsletter] Reactivation error:", updateError)
        return NextResponse.json(
          { success: false, error: "Failed to reactivate subscription" },
          { status: 500 }
        )
      }
    } else {
      // Create new subscription
      const { data: newSubscriber, error: insertError } = await supabase
        .from("newsletter_subscribers")
        .insert({
          email: email.toLowerCase(),
          status: "active",
        })
        .select("confirmation_token")
        .single()

      if (insertError) {
        console.error("[Newsletter] Insert error:", insertError)
        if (insertError.code === "23505") {
          return NextResponse.json(
            { success: false, error: "This email is already subscribed" },
            { status: 409 }
          )
        }
        return NextResponse.json(
          { success: false, error: "Failed to subscribe" },
          { status: 500 }
        )
      }

      // Send welcome email
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://faucero.com"
      const unsubscribeUrl = `${appUrl}/api/newsletter/unsubscribe?token=${newSubscriber.confirmation_token}`
      
      const emailResult = await sendEmail({
        to: email,
        template: getNewsletterWelcomeTemplate(unsubscribeUrl),
      })

      if (!emailResult.success) {
        console.warn("[Newsletter] Failed to send welcome email:", emailResult.error)
        // Don't fail the subscription if email fails
      }
    }

    return NextResponse.json({
      success: true,
      message: "Successfully subscribed to newsletter",
    })
  } catch (error) {
    console.error("[Newsletter] Subscribe error:", error)
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}

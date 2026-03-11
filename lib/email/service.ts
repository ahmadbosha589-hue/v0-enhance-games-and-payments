import { Resend } from "resend"
import type { EmailTemplate } from "./templates"

// Initialize Resend client
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  
  if (!apiKey) {
    console.warn("[Email Service] RESEND_API_KEY not configured. Emails will be logged only.")
    return null
  }

  return new Resend(apiKey)
}

export interface SendEmailOptions {
  to: string
  template: EmailTemplate
  from?: string
}

export async function sendEmail({ to, template, from }: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const fromAddress = from || process.env.EMAIL_FROM || "Faucero <onboarding@resend.dev>"
  const resend = getResendClient()

  // If Resend is not configured, log the email instead
  if (!resend) {
    console.log("[Email Service] Would send email:")
    console.log(`  To: ${to}`)
    console.log(`  From: ${fromAddress}`)
    console.log(`  Subject: ${template.subject}`)
    console.log(`  Body preview: ${template.text.substring(0, 100)}...`)
    return { success: true }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [to],
      subject: template.subject,
      html: template.html,
      text: template.text,
    })

    if (error) {
      console.error("[Email Service] Resend error:", error)
      return {
        success: false,
        error: error.message || "Failed to send email",
      }
    }

    console.log(`[Email Service] Email sent successfully to ${to}, id: ${data?.id}`)
    return { success: true }
  } catch (error) {
    console.error("[Email Service] Failed to send email:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    }
  }
}

// Check if email service is configured
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

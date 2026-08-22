"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PLATFORM_CONFIG } from "@/lib/constants/config"
import { Mail, MessageSquare, Loader2, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import { useLanguage } from "@/lib/i18n/language-context"

export default function ContactPage() {
  const { t } = useLanguage()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const form = e.currentTarget
      const data = new FormData(form)
      const payload = {
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim(),
        subject: String(data.get("subject") || "").trim(),
        message: String(data.get("message") || "").trim(),
      }

      if (!payload.name || !payload.email || !payload.subject || !payload.message) {
        toast.error(t("contact.form.error") || "Please fill in all fields.")
        return
      }

      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) {
        let message = "Failed to send your message."
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch {
          // keep default
        }
        if (res.status === 429) {
          toast.error(message)
          return
        }
        throw new Error(message)
      }

      setIsSubmitted(true)
      toast.success(t("contact.success.title"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send your message.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center py-8 sm:py-16 px-4">
        <Card className="w-full max-w-md border-border/50 text-center">
          <CardContent className="pt-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="mb-2 text-xl sm:text-2xl font-bold">{t("contact.success.title")}</h2>
            <p className="mb-6 text-sm sm:text-base text-muted-foreground">{t("contact.success.description")}</p>
            <Button onClick={() => setIsSubmitted(false)} variant="outline">
              {t("contact.success.another")}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container py-8 sm:py-12 lg:py-16 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="mb-2 sm:mb-4 text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
            {t("contact.title")}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">{t("contact.description")}</p>
        </div>

        {/* Contact Info */}
        <div className="mb-6 sm:mb-8 grid gap-4 sm:grid-cols-2">
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-3 sm:gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("contact.email.title")}</div>
                <a
                  href={`mailto:${PLATFORM_CONFIG.supportEmail}`}
                  className="text-xs sm:text-sm text-primary hover:underline"
                >
                  {PLATFORM_CONFIG.supportEmail}
                </a>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-3 sm:gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("contact.chat.title")}</div>
                <a href={PLATFORM_CONFIG.social.discord} className="text-xs sm:text-sm text-primary hover:underline">
                  {t("contact.chat.link")}
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Contact Form */}
        <Card className="border-border/50">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">{t("contact.form.title")}</CardTitle>
            <CardDescription className="text-xs sm:text-sm">{t("contact.form.description")}</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm">
                    {t("contact.form.name")}
                  </Label>
                  <Input
                    id="name"
                    placeholder={t("contact.form.namePlaceholder")}
                    required
                    disabled={isSubmitting}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm">
                    {t("contact.form.email")}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("contact.form.emailPlaceholder")}
                    required
                    disabled={isSubmitting}
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject" className="text-sm">
                  {t("contact.form.subject")}
                </Label>
                <Select name="subject" required disabled={isSubmitting}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder={t("contact.form.subjectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">{t("contact.form.subject.general")}</SelectItem>
                    <SelectItem value="support">{t("contact.form.subject.support")}</SelectItem>
                    <SelectItem value="account">{t("contact.form.subject.account")}</SelectItem>
                    <SelectItem value="withdrawal">{t("contact.form.subject.withdrawal")}</SelectItem>
                    <SelectItem value="feedback">{t("contact.form.subject.feedback")}</SelectItem>
                    <SelectItem value="partnership">{t("contact.form.subject.partnership")}</SelectItem>
                    <SelectItem value="other">{t("contact.form.subject.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message" className="text-sm">
                  {t("contact.form.message")}
                </Label>
                <Textarea
                  id="message"
                  placeholder={t("contact.form.messagePlaceholder")}
                  rows={5}
                  required
                  disabled={isSubmitting}
                  className="text-sm"
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("contact.form.sending")}
                  </>
                ) : (
                  t("contact.form.submit")
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

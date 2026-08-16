"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/lib/i18n/language-context"
import { CheckCircle, Loader2, AlertCircle } from "lucide-react"

export function NewsletterForm() {
  const { t } = useLanguage()
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !email.includes("@")) {
      setStatus("error")
      setMessage(t("blog.invalidEmail", "Please enter a valid email address"))
      return
    }

    setStatus("loading")
    
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        setStatus("error")
        setMessage(data.error || t("blog.subscribeError", "Something went wrong. Please try again."))
        return
      }

      setStatus("success")
      setMessage(t("blog.subscribeSuccess", "Thank you for subscribing! Check your inbox."))
      setEmail("")
    } catch {
      setStatus("error")
      setMessage(t("blog.subscribeError", "Something went wrong. Please try again."))
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
          <CheckCircle className="w-6 h-6 text-primary" />
        </div>
        <p className="text-sm text-primary font-medium">{message}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex flex-col sm:flex-row w-full max-w-md gap-3">
      <Input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          if (status === "error") setStatus("idle")
        }}
        placeholder={t("blog.emailPlaceholder", "Enter your email")}
        className="flex-1 h-11 sm:h-12 text-sm bg-background/80 backdrop-blur-sm border-border/60 focus:border-primary/50 focus:ring-primary/20"
        disabled={status === "loading"}
      />
      <Button 
        type="submit" 
        size="lg" 
        className="h-11 sm:h-12 px-6 sm:px-8 text-sm font-semibold"
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("blog.subscribing", "Subscribing...")}
          </>
        ) : (
          t("blog.subscribe", "Subscribe")
        )}
      </Button>
      {status === "error" && (
        <div className="absolute -bottom-6 left-0 right-0 flex items-center justify-center gap-1 text-xs text-destructive">
          <AlertCircle className="w-3 h-3" />
          {message}
        </div>
      )}
    </form>
  )
}

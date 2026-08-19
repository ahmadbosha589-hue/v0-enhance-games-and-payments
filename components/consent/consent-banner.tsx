"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Cookie } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DEFAULT_CONSENT, hasDecided, readConsent, writeConsent, type ConsentState } from "@/lib/consent/store"

export function ConsentBanner() {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [consent, setConsent] = useState<ConsentState>(DEFAULT_CONSENT)

  useEffect(() => {
    setMounted(true)
    setConsent(readConsent())

    const sync = () => setConsent(readConsent())
    window.addEventListener("storage", sync)
    window.addEventListener("cookie-preferences-updated", sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener("cookie-preferences-updated", sync)
    }
  }, [])

  if (!mounted || hasDecided(consent) || pathname.startsWith("/admin")) return null

  const choose = (marketing: boolean) => {
    setConsent(writeConsent({ analytics: marketing, functional: true, marketing }))
  }

  return (
    <aside
      role="dialog"
      aria-label="Cookie preferences"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur sm:inset-x-6 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Your cookie choices</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              We use essential cookies to run Faucero. Analytics and partner advertising are optional and will not load
              until you choose. You can change your choice at any time.
            </p>
            <Link href="/cookies" className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline">
              Manage detailed preferences
            </Link>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:min-w-36">
          <Button type="button" variant="outline" onClick={() => choose(false)}>
            Reject optional
          </Button>
          <Button type="button" onClick={() => choose(true)}>
            Accept all
          </Button>
        </div>
      </div>
    </aside>
  )
}

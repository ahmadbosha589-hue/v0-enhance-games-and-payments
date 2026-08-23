"use client"

import { useEffect, useState } from "react"
import { readConsent, type ConsentState } from "@/lib/consent/store"

/**
 * Exposes the full consent state (not just the marketing bit) so callers can
 * distinguish "visitor decided against marketing ads" from "hasn't decided
 * yet". Used by ad surfaces to explain WHY nothing is rendering.
 */
export function useConsentDecision(): {
  decided: boolean
  marketing: boolean
  state: ConsentState | null
} {
  const [state, setState] = useState<ConsentState | null>(null)

  useEffect(() => {
    const sync = () => setState(readConsent())
    sync()
    window.addEventListener("storage", sync)
    window.addEventListener("cookie-preferences-updated", sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener("cookie-preferences-updated", sync)
    }
  }, [])

  return {
    decided: state !== null && state.decidedAt !== null,
    marketing: state?.marketing === true,
    state,
  }
}

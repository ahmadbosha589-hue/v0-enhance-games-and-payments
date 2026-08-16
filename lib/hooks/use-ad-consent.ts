"use client"

import { useEffect, useState } from "react"

const COOKIE_CONSENT_KEY = "cookie_preferences"

interface CookiePreferencesState {
  analytics: boolean
  functional: boolean
  marketing: boolean
}

function readMarketingConsent(): boolean {
  if (typeof window === "undefined") return false
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Partial<CookiePreferencesState>
    return parsed.marketing === true
  } catch {
    return false
  }
}

/**
 * useAdConsent
 * ------------
 * Single source of truth for whether the visitor has opted in to
 * "Marketing" cookies via the Cookie Preferences tool (`/cookies`).
 *
 * Google's AdSense program policies (EU User Consent Policy) and general
 * GDPR/CCPA requirements mean advertising vendors - Google included -
 * should not set non-essential cookies or serve personalized/third-party
 * ads before the visitor has had a chance to consent. Every ad-loading
 * component (AdSlot, MultiNetworkAds, AdsenseBanner wrappers,
 * PublicAdsLayer) should gate on this hook instead of loading
 * unconditionally.
 *
 * Defaults to `false` (no consent) until we can read localStorage, which
 * is the safe/compliant default for a first-time or non-consenting
 * visitor.
 */
export function useAdConsent(): boolean {
  const [hasConsent, setHasConsent] = useState(false)

  useEffect(() => {
    setHasConsent(readMarketingConsent())

    // Cross-tab / cross-component sync: the Cookie Preferences page writes
    // to localStorage directly, so listen for both the native `storage`
    // event (other tabs) and a custom in-tab event dispatched by
    // cookie-preferences.tsx whenever the visitor updates their choice.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === COOKIE_CONSENT_KEY || e.key === null) {
        setHasConsent(readMarketingConsent())
      }
    }
    const handleCustom = () => setHasConsent(readMarketingConsent())

    window.addEventListener("storage", handleStorage)
    window.addEventListener("cookie-preferences-updated", handleCustom)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("cookie-preferences-updated", handleCustom)
    }
  }, [])

  return hasConsent
}
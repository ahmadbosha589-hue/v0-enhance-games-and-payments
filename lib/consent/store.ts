"use client"

export const CONSENT_VERSION = 1
export const CONSENT_KEY = "cookie_preferences"
export const CONSENT_COOKIE = "cc_consent"

export interface ConsentState {
  v: number
  analytics: boolean
  functional: boolean
  marketing: boolean
  decidedAt: string | null
}

export const DEFAULT_CONSENT: ConsentState = {
  v: CONSENT_VERSION,
  analytics: false,
  functional: false,
  marketing: false,
  decidedAt: null,
}

function parseState(raw: string | null): ConsentState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentState>
    if (parsed.v !== CONSENT_VERSION || typeof parsed.decidedAt !== "string") return null
    return {
      v: CONSENT_VERSION,
      analytics: parsed.analytics === true,
      functional: parsed.functional === true,
      marketing: parsed.marketing === true,
      decidedAt: parsed.decidedAt,
    }
  } catch {
    return null
  }
}

function readCookie(): ConsentState | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`))
  return match ? parseState(decodeURIComponent(match[1])) : null
}

export function readConsent(): ConsentState {
  if (typeof window === "undefined") return DEFAULT_CONSENT
  return parseState(window.localStorage.getItem(CONSENT_KEY)) ?? readCookie() ?? DEFAULT_CONSENT
}

export function hasDecided(state: ConsentState): boolean {
  return state.decidedAt !== null
}

export function writeConsent(next: Pick<ConsentState, "analytics" | "functional" | "marketing">): ConsentState {
  const state: ConsentState = {
    v: CONSENT_VERSION,
    analytics: next.analytics,
    functional: next.functional,
    marketing: next.marketing,
    decidedAt: new Date().toISOString(),
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(state))
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(state))}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax`
    window.dispatchEvent(new Event("cookie-preferences-updated"))
  }

  return state
}

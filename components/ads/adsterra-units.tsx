"use client"

import { useEffect } from "react"
import { useAdConsent } from "@/lib/hooks/use-ad-consent"

/**
 * AdsterraUnits
 * -------------
 * The four REAL Adsterra placements from the operator's account, all served
 * from the Adsterra CDN host comparativelykindness.com:
 *
 *   1. Popunder          — /44/63/88/446388c8df548b49c64db4190608db24.js
 *   2. Native banner     — invoke.js + <div id="container-586c92…"> 
 *   3. Social bar        — /fb/9a/28/fb9a286d6a0a3f39b27e8e21bc465006.js
 *   4. Banner 728x90     — atOptions + invoke.js (iframe format)
 *
 * Load-order rules that make these tags actually work:
 *   - The 728x90 unit requires window.atOptions to be set BEFORE its
 *     invoke.js runs (Adsterra's own snippet does this with a paired
 *     <script> pair; here we set the global first, then append the script).
 *   - The native banner's invoke.js looks up its container div by id, so
 *     the container must exist in the DOM before the script executes.
 *   - All four are injected ONCE per page load: client-side navigation in
 *     Next.js re-runs layout effects, and Adsterra's scripts are not
 *     idempotent (double-injection duplicates popunders/social bars).
 *   - Popunder + social bar only belong on surfaces where a redirect/overlay
 *     is tolerable; pass `disableIntrusive` on first-touch marketing pages
 *     (the landing page) so a popunder never bounces a brand-new visitor.
 *
 * Consent: nothing loads without marketing consent, matching every other
 * third-party ad on the site.
 */

const ADSTERRA_CDN = "https://comparativelykindness.com"
const POPUNDER_SRC = `${ADSTERRA_CDN}/44/63/88/446388c8df548b49c64db4190608db24.js`
const NATIVE_KEY = "586c92d65f9f3533be9aa3fd2453cb68"
const SOCIAL_BAR_SRC = `${ADSTERRA_CDN}/fb/9a/28/fb9a286d6a0a3f39b27e8e21bc465006.js`
const BANNER_KEY = "5bebd8bccbeee5ac78edc626c33bf733"

// Module-scope guard: injected exactly once per browser page (the layout
// components remount on client-side navigation; the tags must not re-fire).
declare global {
  interface Window {
    __fauceroAdsterraInjected?: { intrusive?: boolean; display?: boolean }
    atOptions?: Record<string, unknown>
  }
}

function appendScript(src: string, attrs: Record<string, string> = {}) {
  const script = document.createElement("script")
  script.type = "text/javascript"
  script.async = true
  for (const [key, value] of Object.entries(attrs)) script.setAttribute(key, value)
  script.src = src
  document.head.appendChild(script)
  return script
}

export interface AdsterraUnitsProps {
  /** Hide the popunder + social bar (landing page and other first-touch
   * surfaces where an interstitial-style unit would bounce visitors). */
  disableIntrusive?: boolean
  /** Hide the 728x90 banner + native banner (e.g. compact surfaces). */
  disableDisplay?: boolean
}

export function AdsterraUnits({ disableIntrusive = false, disableDisplay = false }: AdsterraUnitsProps = {}) {
  const hasMarketingConsent = useAdConsent()

  useEffect(() => {
    if (!hasMarketingConsent) return
    // Once the intrusive/display sets are injected they stay for the whole
    // page session; a disableIntrusive layout must not double-inject the
    // rest. Track exactly which set has been injected.
    const injected = window.__fauceroAdsterraInjected

    if (!disableIntrusive && !injected?.intrusive) {
      // Popunder
      appendScript(POPUNDER_SRC)
      // Social bar
      appendScript(SOCIAL_BAR_SRC)
    }

    if (!disableDisplay && !injected?.display) {
      // Native banner: container must be in the DOM before invoke.js runs —
      // the script renders into its container div by id lookup.
      const nativeContainerId = "container-586c92d65f9f3533be9aa3fd2453cb68"
      if (!document.getElementById(nativeContainerId)) {
        const container = document.createElement("div")
        container.id = nativeContainerId
        document.body.appendChild(container)
      }
      appendScript(`${ADSTERRA_CDN}/${NATIVE_KEY}/invoke.js`, { async: "async", "data-cfasync": "false" })

      // Banner 728x90: window.atOptions MUST be set before invoke.js runs.
      window.atOptions = {
        key: BANNER_KEY,
        format: "iframe",
        height: 90,
        width: 728,
        params: {},
      }
      appendScript(`${ADSTERRA_CDN}/${BANNER_KEY}/invoke.js`, { async: "async", "data-cfasync": "false" })
    }

    window.__fauceroAdsterraInjected = {
      intrusive: injected?.intrusive || !disableIntrusive,
      display: injected?.display || !disableDisplay,
    }
  }, [hasMarketingConsent, disableIntrusive, disableDisplay])

  return null
}

export default AdsterraUnits

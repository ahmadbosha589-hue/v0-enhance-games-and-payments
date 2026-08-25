"use client"

import { useEffect } from "react"
import { initConsoleProtection } from "@/lib/security/console-protection"
import { scheduleIdleTask } from "@/lib/perf/idle-scheduler"

/**
 * SecurityInit Component
 * Initializes client-side security protections
 * Should be included near the root of the application
 */
export function SecurityInit() {
  useEffect(() => {
    // Initialize console protection
    initConsoleProtection()

    // Additional security measures

    // 1. Disable text selection on sensitive elements
    // NOTE: e.target can be the document node itself (not an Element) when
    // selectstart fires — guard before calling .closest() to prevent crash
    const disableSelection = (e: Event) => {
      const target = e.target
      if (target instanceof Element && target.closest("[data-protected]")) {
        e.preventDefault()
      }
    }

    // 2. Monitor for DOM tampering
    let lastDOMCheck = 0
    const checkDOMIntegrity = () => {
      const now = Date.now()
      if (now - lastDOMCheck < 5000) return // Throttle checks
      lastDOMCheck = now

      // Check for injected scripts
      const scripts = document.querySelectorAll("script")
      scripts.forEach(script => {
        const src = script.src || ""
        const content = script.textContent || ""

        // Check for suspicious script sources or content
        const suspiciousPatterns = [
          /tampermonkey/i,
          /greasemonkey/i,
          /violentmonkey/i,
          /userscript/i,
          /GM_/,
          /unsafeWindow/,
          /document\.cookie\s*=/,
          /localStorage\.setItem\s*\(/,
        ]

        const isSuspicious = suspiciousPatterns.some(
          pattern => pattern.test(src) || pattern.test(content)
        )

        if (isSuspicious) {
          console.warn("[Security] Suspicious script detected")
          // Could report to server here
        }
      })
    }

    // 3. Monitor for iframe injection attempts
    const checkForIframes = () => {
      const iframes = document.querySelectorAll("iframe")
      iframes.forEach(iframe => {
        // Check if iframe was injected by a script (not in original HTML)
        if (!iframe.hasAttribute("data-allowed")) {
          const src = iframe.src || ""
          // Allow known first-party and partner iframes. Our own banner frame
          // (public/ads/cxua/banner-frame.html) is same-origin and hosts the
          // c.cx.ua embed; without this entry every dashboard page logged a
          // false-positive "[Security] Unauthorized iframe" for it.
          const allowedSources = [
            "challenges.cloudflare.com",
            "youtube.com",
            "player.vimeo.com",
            "/ads/cxua/banner-frame.html",
            "c.cx.ua",
            window.location.host,
          ]

          const isAllowed = allowedSources.some(source => src.includes(source))

          if (!isAllowed && src) {
            console.warn("[Security] Unauthorized iframe detected:", src)
          }
        }
      })
    }

    // 4. Monitor for MutationObserver abuse (userscripts often use this)
    const originalMutationObserver = window.MutationObserver
    let observerCount = 0
    const MAX_OBSERVERS = 50

    try {
      ; (window as any).MutationObserver = class extends originalMutationObserver {
        constructor(callback: MutationCallback) {
          super(callback)
          observerCount++

          if (observerCount > MAX_OBSERVERS) {
            console.warn("[Security] Excessive MutationObservers detected")
          }
        }
      }
    } catch {
      // Can't override, that's okay
    }

    // 5. Detect window property additions (userscripts add properties)
    const knownWindowProps = new Set(Object.keys(window))
    const checkNewWindowProps = () => {
      const currentProps = Object.keys(window)
      const newProps = currentProps.filter(prop => !knownWindowProps.has(prop))

      // Check for suspicious new properties
      const suspiciousProps = newProps.filter(prop => {
        const lowerProp = prop.toLowerCase()
        return (
          lowerProp.includes("gm") ||
          lowerProp.includes("tamper") ||
          lowerProp.includes("grease") ||
          lowerProp.includes("userscript") ||
          lowerProp.includes("inject") ||
          lowerProp.startsWith("__")
        )
      })

      if (suspiciousProps.length > 0) {
        console.warn("[Security] Suspicious window properties detected:", suspiciousProps)
      }
    }

    // Run checks during idle time and pause them entirely while the tab is
    // hidden. Security monitoring is still re-armed immediately when the tab
    // becomes visible, but it no longer competes with first paint or spends
    // work on a background page.
    const SECURITY_CHECK_INTERVAL_MS = 15000
    const SECURITY_CHECK_IDLE_TIMEOUT_MS = 5000
    let checkTimer: number | null = null
    let cancelIdleCheck: (() => void) | null = null

    const clearScheduledCheck = () => {
      if (checkTimer !== null) {
        window.clearTimeout(checkTimer)
        checkTimer = null
      }
      cancelIdleCheck?.()
      cancelIdleCheck = null
    }

    const runIntegrityChecks = () => {
      if (document.visibilityState !== "visible") return
      checkDOMIntegrity()
      checkForIframes()
      checkNewWindowProps()
    }

    const scheduleIntegrityCheck = (delay = 0) => {
      clearScheduledCheck()
      if (document.visibilityState !== "visible") return

      checkTimer = window.setTimeout(() => {
        checkTimer = null
        cancelIdleCheck = scheduleIdleTask(
          () => {
            cancelIdleCheck = null
            runIntegrityChecks()
            scheduleIntegrityCheck(SECURITY_CHECK_INTERVAL_MS)
          },
          { timeout: SECURITY_CHECK_IDLE_TIMEOUT_MS },
        )
      }, delay)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleIntegrityCheck()
      } else {
        clearScheduledCheck()
      }
    }

    // Keep the existing protected-element selection guard active for the whole
    // lifetime of the component; only the expensive scans are idle-scheduled.
    document.addEventListener("selectstart", disableSelection)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    scheduleIntegrityCheck()

    // Cleanup
    return () => {
      document.removeEventListener("selectstart", disableSelection)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      clearScheduledCheck()
    }
  }, [])

  return null
}

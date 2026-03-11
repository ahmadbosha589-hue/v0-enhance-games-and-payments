"use client"

import { createContext, useContext, useRef, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useUltimateAntiBot, type BotDetectionResult } from "@/hooks/use-ultimate-anti-bot"

// =====================================================
// ANTI-BOT PROTECTION PROVIDER v5.0
// ZERO FALSE POSITIVE EDITION
// Only takes action with ABSOLUTE certainty
// =====================================================

interface AntiBotContextValue {
  detection: BotDetectionResult
  isBlocked: boolean
}

const AntiBotContext = createContext<AntiBotContextValue>({
  detection: {
    isBot: false,
    isSuspicious: false,
    threatLevel: "none",
    detectedThreats: [],
    score: 0,
    shouldLogout: false,
    timestamp: Date.now(),
    confidence: "low",
  },
  isBlocked: false,
})

export function useAntiBotContext() {
  return useContext(AntiBotContext)
}

interface AntiBotProviderProps {
  children: ReactNode
  onLogout?: () => Promise<void>
}

export function AntiBotProvider({ children, onLogout }: AntiBotProviderProps) {
  const router = useRouter()
  const hasLoggedOut = useRef(false)
  const blockOverlayShown = useRef(false)
  const warningShown = useRef(false)

  const handleBotDetected = async (result: BotDetectionResult) => {
    // Prevent multiple logout attempts
    if (hasLoggedOut.current) return

    // CRITICAL: Only take action with ABSOLUTE confidence
    // This prevents ALL false positives
    if (result.confidence !== "absolute") {
      // Just log for monitoring, don't take action
      console.log("[AntiBot] Detection (no action - low confidence):", {
        score: result.score,
        confidence: result.confidence,
        threats: result.detectedThreats,
      })
      return
    }

    console.error("[AntiBot] CONFIRMED Bot/Automation detected:", {
      score: result.score,
      confidence: result.confidence,
      threats: result.detectedThreats,
      threatLevel: result.threatLevel,
    })

    // Show warning ONCE for suspicious activity (doesn't logout)
    // Only show if we haven't already and not logging out
    if (result.isSuspicious && !result.shouldLogout && !warningShown.current) {
      warningShown.current = true
      toast.warning("Unusual activity detected", {
        description: "Please continue using the site normally.",
        duration: 5000,
      })
    }

    // Force logout ONLY for CONFIRMED bots with ABSOLUTE confidence
    if (result.shouldLogout && result.confidence === "absolute") {
      hasLoggedOut.current = true

      // Show blocking overlay
      if (!blockOverlayShown.current) {
        blockOverlayShown.current = true
        showBlockingOverlay(result)
      }

      toast.error("Security violation detected", {
        description: "Automated browser detected. Please use a standard browser.",
        duration: 15000,
      })

      // Log the detection to server
      try {
        await fetch("/api/security/bot-detection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threats: result.detectedThreats,
            score: result.score,
            threatLevel: result.threatLevel,
            confidence: result.confidence,
            timestamp: result.timestamp,
          }),
        })
      } catch {
        // Silent fail for logging
      }

      // Perform logout
      try {
        if (onLogout) {
          await onLogout()
        } else {
          // Default logout behavior
          await fetch("/api/auth/logout", { method: "POST" })
        }
      } catch {
        // Continue with redirect even if logout API fails
      }

      // Clear all storage
      try {
        localStorage.clear()
        sessionStorage.clear()

        // Clear cookies
        document.cookie.split(";").forEach(cookie => {
          const name = cookie.split("=")[0].trim()
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
        })
      } catch {
        // Storage might be restricted
      }

      // Redirect to login with ban notice
      setTimeout(() => {
        router.push("/auth/login?error=bot_detected&banned=true")
      }, 2000)
    }
  }

  const detection = useUltimateAntiBot(handleBotDetected)

  // =====================================================
  // REMOVED: Aggressive protections that caused false positives
  // =====================================================
  // We NO LONGER:
  // - Block keyboard shortcuts (F12, Ctrl+Shift+I, etc.)
  //   Reason: Power users and developers legitimately use these
  // - Block right-click context menu
  //   Reason: Users need context menus for accessibility
  // - Override eval() and Function constructor
  //   Reason: Breaks legitimate libraries and extensions
  // - Detect debugger statement usage
  //   Reason: Developers debugging issues shouldn't be blocked
  //
  // These "protections" caused more harm than good and made
  // the site unusable for many legitimate users.

  // CRITICAL: Only show blocked screen with ABSOLUTE confidence
  // This prevents ALL false positive blocks
  const isBlocked = detection.shouldLogout && detection.confidence === "absolute"

  return (
    <AntiBotContext.Provider value={{ detection, isBlocked }}>
      {isBlocked ? (
        <BlockedScreen detection={detection} />
      ) : (
        children
      )}
    </AntiBotContext.Provider>
  )
}

// =====================================================
// BLOCKING OVERLAY & SCREEN COMPONENTS
// =====================================================

function showBlockingOverlay(result: BotDetectionResult) {
  const overlay = document.createElement("div")
  overlay.id = "antibot-block-overlay"
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 999999;
    background: rgba(0, 0, 0, 0.95);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    font-family: system-ui, -apple-system, sans-serif;
  `

  overlay.innerHTML = `
    <div style="text-align: center; max-width: 500px; padding: 2rem;">
      <div style="font-size: 4rem; margin-bottom: 1rem;">&#128302;</div>
      <h1 style="font-size: 1.5rem; margin-bottom: 1rem; color: #ef4444;">
        Automated Browser Detected
      </h1>
      <p style="color: #9ca3af; margin-bottom: 1.5rem; line-height: 1.6;">
        Our security system has detected that you are using an automated browser 
        (Selenium, Puppeteer, Playwright, or similar automation tool).
      </p>
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem;">
        <p style="color: #fca5a5; font-size: 0.875rem;">
          Detection Confidence: <strong>ABSOLUTE</strong><br/>
          Detected: <strong>${result.detectedThreats.slice(0, 2).join(", ") || "Automation Framework"}</strong>
        </p>
      </div>
      <p style="color: #6b7280; font-size: 0.875rem;">
        Please use a standard web browser to access this site.<br/>
        Contact support if you believe this is an error.
      </p>
      <div style="margin-top: 2rem;">
        <div style="width: 200px; height: 4px; background: #374151; border-radius: 2px; overflow: hidden; margin: 0 auto;">
          <div style="width: 0; height: 100%; background: #ef4444; animation: loading 2s ease-in-out forwards;"></div>
        </div>
      </div>
    </div>
    <style>
      @keyframes loading {
        to { width: 100%; }
      }
    </style>
  `

  document.body.appendChild(overlay)
}

function BlockedScreen({ detection }: { detection: BotDetectionResult }) {
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background">
      <div className="max-w-md p-8 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <svg
            className="h-10 w-10 text-destructive"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-destructive">
          Automated Browser Detected
        </h1>

        <p className="mb-6 text-muted-foreground">
          Our security system has detected that you are using an automated browser.
          Please use a standard web browser to access this site.
        </p>

        {detection.detectedThreats.length > 0 && (
          <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">
              <strong>Detected:</strong>
            </p>
            <ul className="mt-2 text-left text-xs text-muted-foreground">
              {detection.detectedThreats.slice(0, 3).map((threat, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-destructive">-</span> {threat}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          If you are using a standard browser and believe this is an error,
          please clear your browser cache and try again, or contact support.
        </p>
      </div>
    </div>
  )
}

"use client"

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useUltimateAntiBot, type BotDetectionResult } from "@/hooks/use-ultimate-anti-bot"

// =====================================================
// ANTI-BOT PROTECTION PROVIDER
// Wraps the application to provide bot detection and
// automatic logout functionality
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

  const handleBotDetected = async (result: BotDetectionResult) => {
    // Prevent multiple logout attempts
    if (hasLoggedOut.current) return

    console.error("[AntiBot] Bot/Automation detected:", {
      score: result.score,
      threats: result.detectedThreats,
      threatLevel: result.threatLevel,
    })

    // Show warning for suspicious activity
    if (result.isSuspicious && !result.shouldLogout) {
      toast.warning("Suspicious activity detected", {
        description: "Your session is being monitored for security purposes.",
        duration: 8000,
      })
    }

    // Force logout for confirmed bots
    if (result.shouldLogout) {
      hasLoggedOut.current = true

      // Show blocking overlay
      if (!blockOverlayShown.current) {
        blockOverlayShown.current = true
        showBlockingOverlay(result)
      }

      toast.error("Security violation detected", {
        description: "Automated activity, userscript, or bot usage detected. You have been logged out.",
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

  // Setup additional protection measures
  useEffect(() => {
    // Disable right-click context menu (optional, but reduces casual tampering)
    const handleContextMenu = (e: MouseEvent) => {
      // Allow in development
      if (process.env.NODE_ENV === "development") return
      
      // Only block on sensitive areas
      const target = e.target as HTMLElement
      if (target.closest("[data-protected]")) {
        e.preventDefault()
      }
    }

    // Block keyboard shortcuts that could be used for dev tools
    const handleKeyDown = (e: KeyboardEvent) => {
      if (process.env.NODE_ENV === "development") return

      // Block F12
      if (e.key === "F12") {
        e.preventDefault()
        detection.detectedThreats.push("F12 key blocked")
      }

      // Block Ctrl+Shift+I (Dev Tools)
      if (e.ctrlKey && e.shiftKey && e.key === "I") {
        e.preventDefault()
      }

      // Block Ctrl+Shift+J (Console)
      if (e.ctrlKey && e.shiftKey && e.key === "J") {
        e.preventDefault()
      }

      // Block Ctrl+Shift+C (Inspect)
      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        e.preventDefault()
      }

      // Block Ctrl+U (View Source)
      if (e.ctrlKey && e.key === "u") {
        e.preventDefault()
      }
    }

    // Detect and block eval
    const originalEval = window.eval
    try {
      Object.defineProperty(window, "eval", {
        get() {
          console.warn("[AntiBot] eval() access detected")
          return function() {
            throw new Error("eval() is disabled for security")
          }
        },
        configurable: false,
      })
    } catch {
      // eval protection failed, continue
    }

    // Block Function constructor abuse
    const OriginalFunction = Function
    try {
      ; (window as any).Function = function(...args: any[]) {
        console.warn("[AntiBot] Function constructor access detected")
        throw new Error("Function constructor is disabled for security")
      }
    } catch {
      // Function protection failed, continue
    }

    document.addEventListener("contextmenu", handleContextMenu)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [detection])

  // Detect debugger statement usage
  useEffect(() => {
    const detectDebugger = () => {
      const start = performance.now()
      // This will pause if debugger is active
      ;(() => { debugger })()
      const end = performance.now()
      
      // If it took more than 100ms, debugger was active
      if (end - start > 100) {
        handleBotDetected({
          ...detection,
          isBot: true,
          shouldLogout: true,
          detectedThreats: [...detection.detectedThreats, "Debugger detected"],
          score: detection.score + 50,
        })
      }
    }

    // Only in production
    if (process.env.NODE_ENV === "production") {
      const interval = setInterval(detectDebugger, 3000)
      return () => clearInterval(interval)
    }
  }, [detection])

  const isBlocked = detection.isBot || detection.shouldLogout

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
      <div style="font-size: 4rem; margin-bottom: 1rem;">⚠️</div>
      <h1 style="font-size: 1.5rem; margin-bottom: 1rem; color: #ef4444;">
        Security Violation Detected
      </h1>
      <p style="color: #9ca3af; margin-bottom: 1.5rem; line-height: 1.6;">
        Our security system has detected automated activity, userscripts, 
        or bot usage on your account. This violates our terms of service.
      </p>
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem;">
        <p style="color: #fca5a5; font-size: 0.875rem;">
          Threat Level: <strong>${result.threatLevel.toUpperCase()}</strong><br/>
          Security Score: <strong>${result.score}/100</strong>
        </p>
      </div>
      <p style="color: #6b7280; font-size: 0.875rem;">
        You are being logged out automatically.<br/>
        Contact support if you believe this is an error.
      </p>
      <div style="margin-top: 2rem;">
        <div style="width: 200px; height: 4px; background: #374151; border-radius: 2px; overflow: hidden;">
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
          Access Blocked
        </h1>
        
        <p className="mb-6 text-muted-foreground">
          Automated activity or security violation detected. 
          Your session has been terminated.
        </p>
        
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            <strong>Detected threats:</strong>
          </p>
          <ul className="mt-2 text-left text-xs text-muted-foreground">
            {detection.detectedThreats.slice(0, 5).map((threat, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-destructive">-</span> {threat}
              </li>
            ))}
          </ul>
        </div>
        
        <p className="text-sm text-muted-foreground">
          If you believe this is an error, please contact support.
        </p>
      </div>
    </div>
  )
}

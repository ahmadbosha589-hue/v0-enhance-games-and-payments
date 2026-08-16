"use client"

import { useEffect, useRef, useState, useCallback } from "react"

// =====================================================
// ULTIMATE ANTI-BOT DETECTION SYSTEM v5.0
// ZERO FALSE POSITIVE EDITION
// Maximum protection against bots and automation
// while NEVER flagging legitimate users
// =====================================================

export interface BotDetectionResult {
  isBot: boolean
  isSuspicious: boolean
  threatLevel: "none" | "low" | "medium" | "high" | "critical"
  detectedThreats: string[]
  score: number
  shouldLogout: boolean
  timestamp: number
  confidence: "low" | "medium" | "high" | "absolute"
}

interface MouseMovement {
  x: number
  y: number
  timestamp: number
}

interface KeystrokePattern {
  key: string
  timestamp: number
  duration: number
}

// =====================================================
// CONFIGURATION - Tuned to eliminate false positives
// =====================================================
const BOT_DETECTION_CONFIG = {
  // Scoring thresholds - RAISED to reduce false positives
  // Only flag with HIGH confidence
  SUSPICIOUS_THRESHOLD: 60,    // Was 30 - too sensitive
  BOT_THRESHOLD: 100,          // Was 50 - caused false positives
  LOGOUT_THRESHOLD: 150,       // Was 75 - way too aggressive
  CRITICAL_THRESHOLD: 200,     // Was 90 - need absolute certainty

  // Timing - More lenient
  MOUSE_SAMPLE_INTERVAL: 50,
  BEHAVIOR_CHECK_INTERVAL: 5000,   // Was 2000 - too frequent
  CONSOLE_CHECK_INTERVAL: 3000,    // Was 1000 - too frequent
  WARMUP_PERIOD: 3000,             // NEW: Wait 3s before first check

  // Detection sensitivity - More lenient for humans
  MIN_MOUSE_MOVEMENTS: 2,          // Was 5 - mobile users may not move mouse
  MIN_UNIQUE_POSITIONS: 2,         // Was 3
  PERFECT_TIMING_THRESHOLD: 0.01,  // Was 0.02 - stricter for bot detection
  MIN_CLICKS_FOR_TIMING: 10,       // Need many clicks to detect patterns

  // Penalties - REDUCED to prevent false positives
  // Only DEFINITIVE bot indicators get high penalties
  PENALTIES: {
    // ABSOLUTE indicators (confirmed automation)
    WEBDRIVER_CONFIRMED: 150,      // navigator.webdriver === true
    SELENIUM_GLOBALS: 150,         // __selenium_unwrapped etc
    PUPPETEER_GLOBALS: 150,        // _phantom, __nightmare
    PLAYWRIGHT_GLOBALS: 150,       // playwright hooks
    CYPRESS_GLOBALS: 100,          // Cypress/cy (could be testing)

    // HIGH confidence indicators
    HEADLESS_CONFIRMED: 100,       // HeadlessChrome in UA
    AUTOMATION_FRAMEWORK: 100,

    // MEDIUM confidence - need multiple signals
    TAMPERED_CORE_FUNCTION: 40,    // Was 70 - extensions do this
    ROBOTIC_CLICK_TIMING: 50,      // Perfectly consistent clicks
    IMPOSSIBLE_MOUSE_SPEED: 60,    // > 100px/ms

    // LOW confidence - informational only
    DEVTOOLS_OPEN: 0,              // Was 40 - MANY users use devtools legitimately
    MISSING_PLUGINS: 0,            // Was 30 - Firefox/Safari often have 0
    SIMPLE_ACCEPT_LANGUAGE: 0,     // Was 15 - legitimate browsers vary
    MISSING_FEATURES: 0,           // Was 25 - varies by browser
    NO_USER_GESTURES: 0,           // Was 30 - mobile/touch varies

    // DEPRECATED - caused too many false positives
    // These are now 0 but tracked for logging
    GREASEMONKEY: 0,               // Was 90 - password managers use GM_ APIs
    TAMPERMONKEY: 0,               // Was 90 - legitimate extensions
    VIOLENTMONKEY: 0,              // Was 90 - legitimate extensions
    SCRIPT_INJECTION: 0,           // Was 80 - extensions inject scripts
    FAKE_CANVAS: 0,                // Was 45 - privacy browsers do this
    WEBGL_SPOOF: 0,                // Was 45 - privacy browsers
    CONSOLE_OVERRIDE: 0,           // Was 45 - many extensions do this
  },

  // Minimum number of strong signals required
  MIN_STRONG_SIGNALS: 2,
}

export function useUltimateAntiBot(onBotDetected?: (result: BotDetectionResult) => void) {
  const [result, setResult] = useState<BotDetectionResult>({
    isBot: false,
    isSuspicious: false,
    threatLevel: "none",
    detectedThreats: [],
    score: 0,
    shouldLogout: false,
    timestamp: Date.now(),
    confidence: "low",
  })

  const mouseMovements = useRef<MouseMovement[]>([])
  const keystrokes = useRef<KeystrokePattern[]>([])
  const clickTimings = useRef<number[]>([])
  const userGestures = useRef<number>(0)
  const lastActionTime = useRef<number>(Date.now())
  const isInitialized = useRef(false)
  const detectedThreats = useRef<Set<string>>(new Set())
  const originalFunctions = useRef<Map<string, Function>>(new Map())

  // =====================================================
  // DETECTION LAYER 1: WebDriver & Automation Detection
  // Only flags DEFINITIVE automation - zero false positives
  // =====================================================
  const detectWebDriver = useCallback((): { score: number; strong: boolean } => {
    let score = 0
    let strongSignal = false
    const nav = navigator as any
    const win = window as any

    // Direct WebDriver detection - DEFINITIVE signal
    // This is set by ALL browser automation tools
    if (nav.webdriver === true) {
      detectedThreats.current.add("WebDriver API enabled (navigator.webdriver=true)")
      score += BOT_DETECTION_CONFIG.PENALTIES.WEBDRIVER_CONFIRMED
      strongSignal = true
    }

    // Selenium detection - DEFINITIVE signals
    // These globals are ONLY created by Selenium
    const seleniumGlobals = [
      win.document?.__selenium_unwrapped,
      win.document?.__webdriver_evaluate,
      win.document?.__driver_evaluate,
      win.document?.__webdriver_unwrapped,
      win.document?.__fxdriver_evaluate,
      win.__webdriver_script_fn,
      win.__driver_unwrapped,
      win.__webdriver_script_func,
      win.$cdc_asdjflasutopfhvcZLmcfl_,
      win.$chrome_asyncScriptInfo,
    ]

    if (seleniumGlobals.some(Boolean)) {
      detectedThreats.current.add("Selenium automation framework globals detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.SELENIUM_GLOBALS
      strongSignal = true
    }

    // Puppeteer/PhantomJS detection - DEFINITIVE signals
    if (win._phantom || win.__nightmare || win.callPhantom) {
      detectedThreats.current.add("PhantomJS/Nightmare automation detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.PUPPETEER_GLOBALS
      strongSignal = true
    }

    // Puppeteer CDP detection
    if (win.domAutomation || win.domAutomationController) {
      detectedThreats.current.add("DOM automation controller detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.PUPPETEER_GLOBALS
      strongSignal = true
    }

    // Playwright detection - DEFINITIVE signals
    if (win.playwright || win.__playwright_hook__ || win.__playwright_evaluate__) {
      detectedThreats.current.add("Playwright automation framework detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.PLAYWRIGHT_GLOBALS
      strongSignal = true
    }

    // Cypress detection - note: could be legitimate testing
    if (win.Cypress || win.cy) {
      detectedThreats.current.add("Cypress testing framework detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.CYPRESS_GLOBALS
      strongSignal = true
    }

    // Headless detection - ONLY flag HeadlessChrome explicitly in UA
    // DO NOT flag based on plugins/languages - too many false positives
    if (/HeadlessChrome/i.test(nav.userAgent)) {
      detectedThreats.current.add("Headless Chrome browser detected in User-Agent")
      score += BOT_DETECTION_CONFIG.PENALTIES.HEADLESS_CONFIRMED
      strongSignal = true
    }

    return { score, strong: strongSignal }
  }, [])

  // =====================================================
  // DETECTION LAYER 2: Userscript Manager Detection
  // NOTE: This is now INFORMATIONAL ONLY - no penalties
  // Many legitimate users use password managers, ad blockers,
  // and accessibility tools that use the same APIs
  // =====================================================
  const detectUserscripts = useCallback((): { score: number; detected: boolean } => {
    // Score is always 0 - we don't penalize userscript managers anymore
    // Too many false positives from legitimate extensions
    const win = window as any
    let detected = false

    // Log for informational purposes only
    if (win.GM || win.GM_info || win.GM_getValue || win.GM_setValue ||
      win.GM_xmlhttpRequest || win.GM_addStyle) {
      // Note: Many password managers and accessibility tools expose GM_ APIs
      // This is NOT a definitive bot indicator
      detected = true
    }

    if (win.TM_info || win.TM_addStyle || win.TM_getValue) {
      detected = true
    }

    if (win.VM || win.VM_info) {
      detected = true
    }

    // We NO LONGER scan scripts or attributes
    // This caused too many false positives with legitimate browser extensions

    return { score: 0, detected }
  }, [])

  // =====================================================
  // DETECTION LAYER 3: DevTools & Console Detection
  // NOTE: This is now INFORMATIONAL ONLY - no penalties
  // MANY developers and power users legitimately use devtools
  // This should NEVER cause a false positive
  // =====================================================
  const detectDevTools = useCallback((): { score: number; open: boolean } => {
    // Score is always 0 - we don't penalize devtools anymore
    // Too many legitimate users are developers or curious users
    let open = false

    // Just detect for logging, no penalty
    const threshold = 160
    const widthDiff = window.outerWidth - window.innerWidth
    const heightDiff = window.outerHeight - window.innerHeight

    if (widthDiff > threshold || heightDiff > threshold) {
      open = true
    }

    // We no longer use the console.log trick or Firebug detection
    // These methods are unreliable and cause issues

    return { score: 0, open }
  }, [])

  // =====================================================
  // DETECTION LAYER 4: Function Tampering Detection
  // NOTE: Heavily reduced penalties - browser extensions
  // legitimately modify these functions all the time
  // =====================================================
  const detectTampering = useCallback((): { score: number; tamperedCount: number } => {
    let score = 0
    let tamperedCount = 0

    // Only check a small set of CRITICAL functions
    // Many extensions legitimately patch fetch, console, etc.
    const criticalFunctions = [
      { obj: window, name: "fetch" },
      { obj: document, name: "createElement" },
    ]

    criticalFunctions.forEach(({ obj, name }) => {
      try {
        const fn = (obj as any)[name]
        if (typeof fn === "function") {
          const fnStr = fn.toString()
          // Native functions should have [native code]
          if (!fnStr.includes("[native code]") && !fnStr.includes("{ [native code] }")) {
            tamperedCount++
            // Only add a small penalty - this is common with extensions
          }
        }
      } catch {
        // Access denied - ignore, could be browser security
      }
    })

    // Only penalize if MULTIPLE critical functions are tampered
    // AND we have other strong signals (handled in main orchestrator)
    if (tamperedCount >= 2) {
      score += BOT_DETECTION_CONFIG.PENALTIES.TAMPERED_CORE_FUNCTION
    }

    // We no longer check navigator.toString() - varies by browser

    return { score, tamperedCount }
  }, [])

  // =====================================================
  // DETECTION LAYER 5: Behavioral Analysis
  // NOTE: Significantly relaxed - humans vary greatly
  // Only flag EXTREME automation patterns
  // =====================================================
  const analyzeBehavior = useCallback((): { score: number; suspicious: boolean } => {
    let score = 0
    let suspicious = false
    const movements = mouseMovements.current
    const clicks = clickTimings.current

    // We NO LONGER penalize lack of mouse movement
    // Mobile users, touch devices, and keyboard users may not move mouse
    // This was causing massive false positives

    // Only check for IMPOSSIBLE mouse speed (definitive automation)
    if (movements.length >= 10) {
      let impossibleMoves = 0
      for (let i = 1; i < movements.length; i++) {
        const dx = movements[i].x - movements[i - 1].x
        const dy = movements[i].y - movements[i - 1].y
        const dt = movements[i].timestamp - movements[i - 1].timestamp

        if (dt > 0) {
          const speed = Math.sqrt(dx * dx + dy * dy) / dt
          // > 100 pixels per ms is absolutely impossible for humans
          // Teleporting the mouse is a bot indicator
          if (speed > 100) {
            impossibleMoves++
          }
        }
      }

      // Need MULTIPLE impossible moves to flag
      if (impossibleMoves >= 3) {
        detectedThreats.current.add(`Impossible mouse movement pattern (${impossibleMoves} teleports)`)
        score += BOT_DETECTION_CONFIG.PENALTIES.IMPOSSIBLE_MOUSE_SPEED
        suspicious = true
      }
    }

    // Check for ROBOTIC click timing patterns
    // Require MANY clicks to detect - humans can be consistent over short periods
    if (clicks.length >= BOT_DETECTION_CONFIG.MIN_CLICKS_FOR_TIMING) {
      const intervals: number[] = []
      for (let i = 1; i < clicks.length; i++) {
        intervals.push(clicks[i] - clicks[i - 1])
      }

      // Calculate coefficient of variation
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      if (avg > 0) {
        const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length
        const stdDev = Math.sqrt(variance)
        const coeffOfVar = stdDev / avg

        // EXTREMELY consistent timing over MANY clicks is bot-like
        // Use very strict threshold to avoid false positives
        if (coeffOfVar < BOT_DETECTION_CONFIG.PERFECT_TIMING_THRESHOLD) {
          detectedThreats.current.add(`Robotic click timing (CV: ${(coeffOfVar * 100).toFixed(2)}%)`)
          score += BOT_DETECTION_CONFIG.PENALTIES.ROBOTIC_CLICK_TIMING
          suspicious = true
        }
      }
    }

    // We NO LONGER check user gestures - too many edge cases

    return { score, suspicious }
  }, [])

  // =====================================================
  // DETECTION LAYER 6: Canvas/WebGL Fingerprint Spoofing
  // NOTE: This is now INFORMATIONAL ONLY - no penalties
  // Privacy-focused browsers (Brave, Firefox with RFP, Tor)
  // legitimately spoof these values for user privacy
  // =====================================================
  const detectCanvasSpoofing = useCallback((): { score: number; spoofed: boolean } => {
    // Score is always 0 - we don't penalize fingerprint protection
    // Users have a RIGHT to privacy
    let spoofed = false

    try {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")

      if (ctx) {
        ctx.textBaseline = "top"
        ctx.font = "14px 'Arial'"
        ctx.fillStyle = "#f60"
        ctx.fillRect(125, 1, 62, 20)
        ctx.fillStyle = "#069"
        ctx.fillText("Bot detection", 2, 15)

        const dataUrl = canvas.toDataURL()

        // Just detect for logging, no penalty
        if (dataUrl === "data:," || dataUrl.length < 100) {
          spoofed = true
        }
      }
    } catch {
      // Canvas errors are fine - some browsers block this
      spoofed = true
    }

    // WebGL detection - informational only
    try {
      const canvas = document.createElement("canvas")
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl")

      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info")
        if (debugInfo) {
          const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)

          // Just detect, no penalty
          if (!renderer || !vendor ||
            renderer.includes("SwiftShader") ||
            renderer.includes("llvmpipe") ||
            vendor.includes("Brian Paul")) {
            spoofed = true
          }
        }
      }
    } catch {
      // WebGL errors are fine
    }

    return { score: 0, spoofed }
  }, [])

  // =====================================================
  // DETECTION LAYER 7: Console Paste Prevention
  // NOTE: Removed - this caused usability issues
  // Users legitimately paste code, URLs, etc.
  // =====================================================
  const setupConsolePasteDetection = useCallback(() => {
    // DISABLED - We no longer intercept paste events
    // This was blocking legitimate user actions like:
    // - Pasting wallet addresses
    // - Pasting referral codes
    // - Pasting support ticket info
    // The security benefit was minimal

    return () => {
      // No cleanup needed
    }
  }, [])

  // =====================================================
  // DETECTION LAYER 8: Feature Detection
  // NOTE: This is now INFORMATIONAL ONLY - no penalties
  // Browser features vary WILDLY between browsers and versions
  // =====================================================
  const detectMissingFeatures = useCallback((): { score: number; anomalies: string[] } => {
    // Score is always 0 - browser features vary too much
    const anomalies: string[] = []
    const nav = navigator as any

    // Just log anomalies for debugging, don't penalize
    const expectedFeatures = [
      "credentials",
      "mediaDevices",
      "permissions",
      "serviceWorker",
      "storage",
    ]

    let missingCount = 0
    expectedFeatures.forEach(feature => {
      if (!(feature in nav)) {
        missingCount++
      }
    })

    if (missingCount > 3) {
      anomalies.push(`missing_${missingCount}_features`)
    }

    // UA/Platform check - informational only
    // Many browsers spoof these for privacy
    const ua = (nav.userAgent || "").toLowerCase()
    const platform = (nav.platform || "").toLowerCase()

    if ((ua.includes("windows") && platform.includes("mac")) ||
      (ua.includes("mac") && platform.includes("win"))) {
      anomalies.push("ua_platform_mismatch")
    }

    // We no longer check plugin count - Firefox/Safari often have 0

    return { score: 0, anomalies }
  }, [])

  // =====================================================
  // MAIN DETECTION ORCHESTRATOR
  // ZERO FALSE POSITIVE DESIGN:
  // - Only flag with MULTIPLE strong signals
  // - Require HIGH confidence for any action
  // - Never logout without ABSOLUTE certainty
  // =====================================================
  const runFullDetection = useCallback((): BotDetectionResult => {
    detectedThreats.current.clear()
    let totalScore = 0
    let strongSignals = 0

    // Run all detection layers - now returning structured results
    const webdriverResult = detectWebDriver()
    totalScore += webdriverResult.score
    if (webdriverResult.strong) strongSignals++

    const userscriptResult = detectUserscripts()
    totalScore += userscriptResult.score
    // Userscripts no longer count as strong signals

    const devtoolsResult = detectDevTools()
    totalScore += devtoolsResult.score
    // DevTools no longer count as strong signals

    const tamperingResult = detectTampering()
    totalScore += tamperingResult.score
    // Tampering only counts if combined with other signals

    const behaviorResult = analyzeBehavior()
    totalScore += behaviorResult.score
    if (behaviorResult.suspicious) strongSignals++

    const canvasResult = detectCanvasSpoofing()
    totalScore += canvasResult.score
    // Canvas spoofing no longer counts as strong signals

    const featureResult = detectMissingFeatures()
    totalScore += featureResult.score
    // Missing features no longer count

    // CRITICAL: Require MULTIPLE strong signals
    // A single indicator should NEVER trigger bot detection
    const hasMultipleStrong = strongSignals >= BOT_DETECTION_CONFIG.MIN_STRONG_SIGNALS

    // Determine confidence level
    let confidence: BotDetectionResult["confidence"] = "low"
    if (strongSignals >= 3 || totalScore >= 200) {
      confidence = "absolute"
    } else if (strongSignals >= 2 || totalScore >= 150) {
      confidence = "high"
    } else if (strongSignals >= 1 || totalScore >= 100) {
      confidence = "medium"
    }

    // Determine threat level - ONLY if we have confidence
    let threatLevel: BotDetectionResult["threatLevel"] = "none"
    if (totalScore >= BOT_DETECTION_CONFIG.CRITICAL_THRESHOLD && hasMultipleStrong) {
      threatLevel = "critical"
    } else if (totalScore >= BOT_DETECTION_CONFIG.LOGOUT_THRESHOLD && hasMultipleStrong) {
      threatLevel = "high"
    } else if (totalScore >= BOT_DETECTION_CONFIG.BOT_THRESHOLD && strongSignals >= 1) {
      threatLevel = "medium"
    } else if (totalScore >= BOT_DETECTION_CONFIG.SUSPICIOUS_THRESHOLD) {
      threatLevel = "low"
    }

    // CRITICAL: Only flag as bot with HIGH confidence
    // Single signals should NEVER trigger this
    const isBot = totalScore >= BOT_DETECTION_CONFIG.BOT_THRESHOLD &&
      hasMultipleStrong &&
      confidence !== "low"

    // CRITICAL: Only logout with ABSOLUTE certainty
    // This is destructive - user loses session
    const shouldLogout = totalScore >= BOT_DETECTION_CONFIG.LOGOUT_THRESHOLD &&
      strongSignals >= BOT_DETECTION_CONFIG.MIN_STRONG_SIGNALS &&
      confidence === "absolute"

    const newResult: BotDetectionResult = {
      isBot,
      isSuspicious: totalScore >= BOT_DETECTION_CONFIG.SUSPICIOUS_THRESHOLD && strongSignals >= 1,
      threatLevel,
      detectedThreats: Array.from(detectedThreats.current),
      score: totalScore,
      shouldLogout,
      timestamp: Date.now(),
      confidence,
    }

    return newResult
  }, [detectWebDriver, detectUserscripts, detectDevTools, detectTampering,
    analyzeBehavior, detectCanvasSpoofing, detectMissingFeatures])

  // =====================================================
  // EVENT LISTENERS & INITIALIZATION
  // With WARMUP period to avoid false positives
  // =====================================================
  useEffect(() => {
    if (isInitialized.current) return
    isInitialized.current = true

    // Setup paste detection (now a no-op but kept for compatibility)
    const cleanupPaste = setupConsolePasteDetection()

    // Mouse movement tracking
    const handleMouseMove = (e: MouseEvent) => {
      mouseMovements.current.push({
        x: e.clientX,
        y: e.clientY,
        timestamp: Date.now(),
      })

      // Keep only last 100 movements
      if (mouseMovements.current.length > 100) {
        mouseMovements.current = mouseMovements.current.slice(-100)
      }

      lastActionTime.current = Date.now()
    }

    // Click tracking
    const handleClick = () => {
      clickTimings.current.push(Date.now())
      userGestures.current++

      // Keep only last 50 clicks
      if (clickTimings.current.length > 50) {
        clickTimings.current = clickTimings.current.slice(-50)
      }

      lastActionTime.current = Date.now()
    }

    // Keyboard tracking
    let keyDownTime = 0
    const handleKeyDown = () => {
      keyDownTime = Date.now()
      userGestures.current++
      lastActionTime.current = Date.now()
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const duration = Date.now() - keyDownTime
      keystrokes.current.push({
        key: e.key,
        timestamp: Date.now(),
        duration,
      })

      // Keep only last 50 keystrokes
      if (keystrokes.current.length > 50) {
        keystrokes.current = keystrokes.current.slice(-50)
      }
    }

    // Add listeners
    document.addEventListener("mousemove", handleMouseMove, { passive: true })
    document.addEventListener("click", handleClick, { passive: true })
    document.addEventListener("keydown", handleKeyDown, { passive: true })
    document.addEventListener("keyup", handleKeyUp, { passive: true })

    // WARMUP PERIOD: Wait before first detection
    // This gives the user time to interact naturally
    // and prevents false positives on immediate page load
    const warmupTimeout = setTimeout(() => {
      const initialResult = runFullDetection()
      setResult(initialResult)

      // Only notify if we have STRONG evidence
      if (initialResult.shouldLogout && initialResult.confidence === "absolute") {
        onBotDetected?.(initialResult)
      }
    }, BOT_DETECTION_CONFIG.WARMUP_PERIOD)

    // Periodic checks - less frequent to reduce CPU and false positives
    const checkInterval = setInterval(() => {
      const newResult = runFullDetection()
      setResult(newResult)

      // Only call callback for CONFIRMED bots
      if (newResult.shouldLogout && newResult.confidence === "absolute") {
        onBotDetected?.(newResult)
      }
    }, BOT_DETECTION_CONFIG.BEHAVIOR_CHECK_INTERVAL)

    // Cleanup
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("click", handleClick)
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("keyup", handleKeyUp)
      clearTimeout(warmupTimeout)
      clearInterval(checkInterval)
      cleanupPaste()
    }
  }, [runFullDetection, setupConsolePasteDetection, onBotDetected])

  // Re-check on visibility change - but don't be aggressive
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const newResult = runFullDetection()
        setResult(newResult)
        // Only act on ABSOLUTE confidence with shouldLogout
        if (newResult.shouldLogout && newResult.confidence === "absolute") {
          onBotDetected?.(newResult)
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [runFullDetection, onBotDetected])

  return result
}

// =====================================================
// PROOF OF WORK CHALLENGE GENERATOR
// =====================================================
export function generateProofOfWork(difficulty: number = 4): { challenge: string; prefix: string } {
  const challenge = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
  const prefix = "0".repeat(difficulty)
  return { challenge, prefix }
}

export async function verifyProofOfWork(
  challenge: string,
  nonce: number,
  prefix: string
): Promise<boolean> {
  const data = `${challenge}${nonce}`
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data))
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
  return hashHex.startsWith(prefix)
}

export async function solveProofOfWork(
  challenge: string,
  prefix: string,
  maxIterations: number = 1000000
): Promise<{ nonce: number; hash: string } | null> {
  for (let nonce = 0; nonce < maxIterations; nonce++) {
    const data = `${challenge}${nonce}`
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data))
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")

    if (hashHex.startsWith(prefix)) {
      return { nonce, hash: hashHex }
    }

    // Yield to prevent blocking (every 1000 iterations)
    if (nonce % 1000 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
  return null
}

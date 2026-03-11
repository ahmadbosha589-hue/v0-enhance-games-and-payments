"use client"

import { useEffect, useRef, useState, useCallback } from "react"

// =====================================================
// ULTIMATE ANTI-BOT DETECTION SYSTEM
// Comprehensive protection against bots, automation,
// userscripts, console abuse, and all forms of cheating
// =====================================================

export interface BotDetectionResult {
  isBot: boolean
  isSuspicious: boolean
  threatLevel: "none" | "low" | "medium" | "high" | "critical"
  detectedThreats: string[]
  score: number
  shouldLogout: boolean
  timestamp: number
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

const BOT_DETECTION_CONFIG = {
  // Scoring thresholds
  SUSPICIOUS_THRESHOLD: 30,
  BOT_THRESHOLD: 50,
  LOGOUT_THRESHOLD: 75,
  CRITICAL_THRESHOLD: 90,
  
  // Timing
  MOUSE_SAMPLE_INTERVAL: 50,
  BEHAVIOR_CHECK_INTERVAL: 2000,
  CONSOLE_CHECK_INTERVAL: 1000,
  
  // Detection sensitivity
  MIN_MOUSE_MOVEMENTS: 5,
  MIN_UNIQUE_POSITIONS: 3,
  PERFECT_TIMING_THRESHOLD: 0.02, // 20ms variance is suspicious
  
  // Penalties
  PENALTIES: {
    WEBDRIVER: 100,
    HEADLESS: 100,
    DEVTOOLS_OPEN: 40,
    CONSOLE_PASTE: 60,
    USERSCRIPT: 80,
    AUTOMATION_FRAMEWORK: 100,
    MISSING_PLUGINS: 30,
    SUSPICIOUS_TIMING: 25,
    NO_MOUSE_MOVEMENT: 35,
    LINEAR_MOUSE: 30,
    IMPOSSIBLE_SPEED: 40,
    TAMPERED_FUNCTIONS: 70,
    MODIFIED_NAVIGATOR: 50,
    FAKE_CANVAS: 45,
    WEBGL_SPOOF: 45,
    AUDIO_SPOOF: 35,
    TIMEZONE_MISMATCH: 20,
    NO_USER_GESTURES: 30,
    RAPID_ACTIONS: 25,
    GREASEMONKEY: 90,
    TAMPERMONKEY: 90,
    VIOLENTMONKEY: 90,
    SCRIPT_INJECTION: 80,
    PROXY_FUNCTION: 60,
    IFRAME_MANIPULATION: 50,
    DOM_MUTATION_FLOOD: 35,
    EVAL_ABUSE: 55,
    CONSOLE_OVERRIDE: 45,
    SUSPICIOUS_HEADERS: 30,
    MISSING_FEATURES: 25,
    CLIPBOARD_INTERCEPT: 40,
  },
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
  // =====================================================
  const detectWebDriver = useCallback((): number => {
    let score = 0
    const nav = navigator as any
    const win = window as any
    
    // Direct WebDriver detection
    if (nav.webdriver) {
      detectedThreats.current.add("WebDriver detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.WEBDRIVER
    }
    
    // Selenium detection
    if (win.document.__selenium_unwrapped ||
        win.document.__webdriver_evaluate ||
        win.document.__driver_evaluate ||
        win.document.__webdriver_unwrapped ||
        win.document.__fxdriver_evaluate ||
        win.__webdriver_script_fn ||
        win.__driver_unwrapped ||
        win.__webdriver_script_func ||
        win.$cdc_asdjflasutopfhvcZLmcfl_ ||
        win.$chrome_asyncScriptInfo) {
      detectedThreats.current.add("Selenium framework detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.AUTOMATION_FRAMEWORK
    }
    
    // Puppeteer detection
    if (win._phantom || win.__nightmare || win.callPhantom ||
        nav.__webdriver_script_fn || win.domAutomation || win.domAutomationController) {
      detectedThreats.current.add("Puppeteer/Phantom detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.AUTOMATION_FRAMEWORK
    }
    
    // Playwright detection
    if (win.playwright || win.__playwright_hook__) {
      detectedThreats.current.add("Playwright detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.AUTOMATION_FRAMEWORK
    }
    
    // Cypress detection
    if (win.Cypress || win.cy) {
      detectedThreats.current.add("Cypress detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.AUTOMATION_FRAMEWORK
    }
    
    // Headless detection
    if (/HeadlessChrome/.test(nav.userAgent) ||
        nav.plugins.length === 0 ||
        !nav.languages || nav.languages.length === 0) {
      detectedThreats.current.add("Headless browser detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.HEADLESS
    }
    
    return score
  }, [])

  // =====================================================
  // DETECTION LAYER 2: Userscript Manager Detection
  // =====================================================
  const detectUserscripts = useCallback((): number => {
    let score = 0
    const win = window as any
    
    // Greasemonkey
    if (win.GM || win.GM_info || win.GM_getValue || win.GM_setValue ||
        win.GM_xmlhttpRequest || win.GM_addStyle || win.GM_log ||
        win.GM_registerMenuCommand || win.GM_getResourceText ||
        win.GM_notification || win.unsafeWindow) {
      detectedThreats.current.add("Greasemonkey userscript detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.GREASEMONKEY
    }
    
    // Tampermonkey
    if (win.TM_info || win.TM_addStyle || win.TM_getValue) {
      detectedThreats.current.add("Tampermonkey detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.TAMPERMONKEY
    }
    
    // Violentmonkey
    if (win.VM || win.VM_info) {
      detectedThreats.current.add("Violentmonkey detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.VIOLENTMONKEY
    }
    
    // Generic userscript detection via document attributes
    const htmlElement = document.documentElement
    const bodyElement = document.body
    
    const checkForInjectedAttr = (el: Element): boolean => {
      const attrs = el.attributes
      for (let i = 0; i < attrs.length; i++) {
        const name = attrs[i].name.toLowerCase()
        if (name.includes("userscript") || name.includes("tamper") ||
            name.includes("grease") || name.includes("violent") ||
            name.includes("monkey") || name.startsWith("data-gm") ||
            name.startsWith("data-tm")) {
          return true
        }
      }
      return false
    }
    
    if (checkForInjectedAttr(htmlElement) || checkForInjectedAttr(bodyElement)) {
      detectedThreats.current.add("Userscript injection detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.SCRIPT_INJECTION
    }
    
    // Check for injected scripts
    const scripts = document.querySelectorAll("script")
    scripts.forEach(script => {
      const src = script.src || ""
      const content = script.textContent || ""
      if (src.includes("tampermonkey") || src.includes("greasemonkey") ||
          src.includes("violentmonkey") || src.includes("userscript") ||
          content.includes("GM_") || content.includes("unsafeWindow")) {
        detectedThreats.current.add("Injected userscript found")
        score += BOT_DETECTION_CONFIG.PENALTIES.SCRIPT_INJECTION
      }
    })
    
    return score
  }, [])

  // =====================================================
  // DETECTION LAYER 3: DevTools & Console Detection
  // =====================================================
  const detectDevTools = useCallback((): number => {
    let score = 0
    const win = window as any
    
    // Method 1: Threshold detection
    const threshold = 160
    const widthDiff = window.outerWidth - window.innerWidth
    const heightDiff = window.outerHeight - window.innerHeight
    
    if (widthDiff > threshold || heightDiff > threshold) {
      detectedThreats.current.add("DevTools window detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.DEVTOOLS_OPEN
    }
    
    // Method 2: Firebug detection
    if (win.Firebug?.chrome?.isInitialized || win.console?.firebug) {
      detectedThreats.current.add("Firebug detected")
      score += BOT_DETECTION_CONFIG.PENALTIES.DEVTOOLS_OPEN
    }
    
    // Method 3: Chrome DevTools detection via toString
    const devtools = /./
    let devtoolsOpen = false
    devtools.toString = function() {
      devtoolsOpen = true
      return ""
    }
    console.log("%c", devtools as any)
    if (devtoolsOpen) {
      detectedThreats.current.add("Console active detected")
      score += Math.round(BOT_DETECTION_CONFIG.PENALTIES.DEVTOOLS_OPEN * 0.5)
    }
    
    return score
  }, [])

  // =====================================================
  // DETECTION LAYER 4: Function Tampering Detection
  // =====================================================
  const detectTampering = useCallback((): number => {
    let score = 0
    
    const criticalFunctions = [
      { obj: window, name: "fetch" },
      { obj: window, name: "setTimeout" },
      { obj: window, name: "setInterval" },
      { obj: window, name: "XMLHttpRequest" },
      { obj: document, name: "querySelector" },
      { obj: document, name: "querySelectorAll" },
      { obj: document, name: "getElementById" },
      { obj: Element.prototype, name: "addEventListener" },
      { obj: console, name: "log" },
      { obj: console, name: "warn" },
      { obj: console, name: "error" },
    ]
    
    criticalFunctions.forEach(({ obj, name }) => {
      try {
        const fn = (obj as any)[name]
        if (typeof fn === "function") {
          const fnStr = fn.toString()
          // Native functions should have [native code]
          if (!fnStr.includes("[native code]") && !fnStr.includes("{ [native code] }")) {
            detectedThreats.current.add(`Tampered function: ${name}`)
            score += BOT_DETECTION_CONFIG.PENALTIES.TAMPERED_FUNCTIONS
          }
        }
      } catch {
        // Access denied might indicate tampering
        score += 10
      }
    })
    
    // Check for Proxy on critical objects
    try {
      const nav = navigator
      if (nav.toString() !== "[object Navigator]") {
        detectedThreats.current.add("Navigator object modified")
        score += BOT_DETECTION_CONFIG.PENALTIES.MODIFIED_NAVIGATOR
      }
    } catch {
      score += 20
    }
    
    return score
  }, [])

  // =====================================================
  // DETECTION LAYER 5: Behavioral Analysis
  // =====================================================
  const analyzeBehavior = useCallback((): number => {
    let score = 0
    const movements = mouseMovements.current
    const clicks = clickTimings.current
    
    // Check for lack of mouse movement
    if (movements.length < BOT_DETECTION_CONFIG.MIN_MOUSE_MOVEMENTS) {
      detectedThreats.current.add("No natural mouse movement")
      score += BOT_DETECTION_CONFIG.PENALTIES.NO_MOUSE_MOVEMENT
    } else {
      // Check for linear/perfect mouse movement (bot behavior)
      const uniqueX = new Set(movements.map(m => m.x)).size
      const uniqueY = new Set(movements.map(m => m.y)).size
      
      if (uniqueX < BOT_DETECTION_CONFIG.MIN_UNIQUE_POSITIONS ||
          uniqueY < BOT_DETECTION_CONFIG.MIN_UNIQUE_POSITIONS) {
        detectedThreats.current.add("Linear mouse movement pattern")
        score += BOT_DETECTION_CONFIG.PENALTIES.LINEAR_MOUSE
      }
      
      // Check for impossible mouse speed
      for (let i = 1; i < movements.length; i++) {
        const dx = movements[i].x - movements[i - 1].x
        const dy = movements[i].y - movements[i - 1].y
        const dt = movements[i].timestamp - movements[i - 1].timestamp
        
        if (dt > 0) {
          const speed = Math.sqrt(dx * dx + dy * dy) / dt
          // > 50 pixels per ms is humanly impossible
          if (speed > 50) {
            detectedThreats.current.add("Impossible mouse speed")
            score += BOT_DETECTION_CONFIG.PENALTIES.IMPOSSIBLE_SPEED
            break
          }
        }
      }
    }
    
    // Check for suspicious click timing patterns
    if (clicks.length >= 3) {
      const intervals: number[] = []
      for (let i = 1; i < clicks.length; i++) {
        intervals.push(clicks[i] - clicks[i - 1])
      }
      
      // Calculate variance
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length
      const stdDev = Math.sqrt(variance)
      const coeffOfVar = stdDev / avg
      
      // Too consistent = bot
      if (coeffOfVar < BOT_DETECTION_CONFIG.PERFECT_TIMING_THRESHOLD && intervals.length >= 5) {
        detectedThreats.current.add("Suspiciously consistent timing")
        score += BOT_DETECTION_CONFIG.PENALTIES.SUSPICIOUS_TIMING
      }
    }
    
    // Check for lack of user gestures
    if (userGestures.current < 2) {
      score += BOT_DETECTION_CONFIG.PENALTIES.NO_USER_GESTURES
    }
    
    return score
  }, [])

  // =====================================================
  // DETECTION LAYER 6: Canvas/WebGL Fingerprint Spoofing
  // =====================================================
  const detectCanvasSpoofing = useCallback((): number => {
    let score = 0
    
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
        
        // Check for common spoofed values
        if (dataUrl === "data:," || dataUrl.length < 100) {
          detectedThreats.current.add("Canvas fingerprint blocked")
          score += BOT_DETECTION_CONFIG.PENALTIES.FAKE_CANVAS
        }
      }
    } catch {
      // Canvas errors might indicate spoofing
      score += 15
    }
    
    // WebGL detection
    try {
      const canvas = document.createElement("canvas")
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
      
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info")
        if (debugInfo) {
          const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
          
          // Check for known spoofed/virtual values
          if (!renderer || !vendor ||
              renderer.includes("SwiftShader") ||
              renderer.includes("llvmpipe") ||
              vendor.includes("Brian Paul")) {
            detectedThreats.current.add("WebGL fingerprint spoofed")
            score += BOT_DETECTION_CONFIG.PENALTIES.WEBGL_SPOOF
          }
        }
      }
    } catch {
      // Might be blocked
      score += 10
    }
    
    return score
  }, [])

  // =====================================================
  // DETECTION LAYER 7: Console Paste Prevention
  // =====================================================
  const setupConsolePasteDetection = useCallback(() => {
    // Block paste in console by monitoring paste events globally
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      
      // Allow paste in input fields
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }
      
      // If pasting elsewhere (potentially console), flag it
      const clipboardData = e.clipboardData?.getData("text") || ""
      
      // Check for suspicious code patterns
      const suspiciousPatterns = [
        /eval\s*\(/,
        /Function\s*\(/,
        /document\.cookie/,
        /localStorage/,
        /sessionStorage/,
        /XMLHttpRequest/,
        /fetch\s*\(/,
        /\$\(/,
        /jQuery/,
        /\.click\(\)/,
        /\.trigger\(/,
        /setInterval/,
        /setTimeout.*\d{3,}/,
        /chrome\.runtime/,
        /browser\.runtime/,
        /GM_/,
        /unsafeWindow/,
        /\.submit\(\)/,
        /\.value\s*=/,
        /innerHTML\s*=/,
        /outerHTML\s*=/,
      ]
      
      if (suspiciousPatterns.some(pattern => pattern.test(clipboardData))) {
        detectedThreats.current.add("Suspicious code paste detected")
        e.preventDefault()
        // Trigger high alert
        return true
      }
    }
    
    document.addEventListener("paste", handlePaste, true)
    
    return () => {
      document.removeEventListener("paste", handlePaste, true)
    }
  }, [])

  // =====================================================
  // DETECTION LAYER 8: Feature Detection
  // =====================================================
  const detectMissingFeatures = useCallback((): number => {
    let score = 0
    const nav = navigator as any
    
    // Check for missing features that real browsers have
    const expectedFeatures = [
      "credentials",
      "mediaDevices",
      "permissions",
      "serviceWorker",
      "storage",
      "bluetooth",
      "usb",
      "serial",
      "hid",
    ]
    
    let missingCount = 0
    expectedFeatures.forEach(feature => {
      if (!(feature in nav)) {
        missingCount++
      }
    })
    
    if (missingCount > 4) {
      detectedThreats.current.add("Missing browser features")
      score += BOT_DETECTION_CONFIG.PENALTIES.MISSING_FEATURES
    }
    
    // Check for inconsistent user agent
    const ua = nav.userAgent.toLowerCase()
    const platform = nav.platform?.toLowerCase() || ""
    
    if ((ua.includes("windows") && platform.includes("mac")) ||
        (ua.includes("mac") && platform.includes("win")) ||
        (ua.includes("linux") && !platform.includes("linux") && !platform.includes("android"))) {
      detectedThreats.current.add("User agent/platform mismatch")
      score += BOT_DETECTION_CONFIG.PENALTIES.MODIFIED_NAVIGATOR
    }
    
    // Check plugin count
    if (nav.plugins.length === 0 && !ua.includes("mobile") && !ua.includes("android")) {
      score += BOT_DETECTION_CONFIG.PENALTIES.MISSING_PLUGINS
    }
    
    return score
  }, [])

  // =====================================================
  // MAIN DETECTION ORCHESTRATOR
  // =====================================================
  const runFullDetection = useCallback((): BotDetectionResult => {
    detectedThreats.current.clear()
    let totalScore = 0
    
    // Run all detection layers
    totalScore += detectWebDriver()
    totalScore += detectUserscripts()
    totalScore += detectDevTools()
    totalScore += detectTampering()
    totalScore += analyzeBehavior()
    totalScore += detectCanvasSpoofing()
    totalScore += detectMissingFeatures()
    
    // Determine threat level
    let threatLevel: BotDetectionResult["threatLevel"] = "none"
    if (totalScore >= BOT_DETECTION_CONFIG.CRITICAL_THRESHOLD) {
      threatLevel = "critical"
    } else if (totalScore >= BOT_DETECTION_CONFIG.LOGOUT_THRESHOLD) {
      threatLevel = "high"
    } else if (totalScore >= BOT_DETECTION_CONFIG.BOT_THRESHOLD) {
      threatLevel = "medium"
    } else if (totalScore >= BOT_DETECTION_CONFIG.SUSPICIOUS_THRESHOLD) {
      threatLevel = "low"
    }
    
    const newResult: BotDetectionResult = {
      isBot: totalScore >= BOT_DETECTION_CONFIG.BOT_THRESHOLD,
      isSuspicious: totalScore >= BOT_DETECTION_CONFIG.SUSPICIOUS_THRESHOLD,
      threatLevel,
      detectedThreats: Array.from(detectedThreats.current),
      score: totalScore,
      shouldLogout: totalScore >= BOT_DETECTION_CONFIG.LOGOUT_THRESHOLD,
      timestamp: Date.now(),
    }
    
    return newResult
  }, [detectWebDriver, detectUserscripts, detectDevTools, detectTampering, 
      analyzeBehavior, detectCanvasSpoofing, detectMissingFeatures])

  // =====================================================
  // EVENT LISTENERS & INITIALIZATION
  // =====================================================
  useEffect(() => {
    if (isInitialized.current) return
    isInitialized.current = true
    
    // Setup paste detection
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
    const handleKeyDown = (e: KeyboardEvent) => {
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
    
    // Initial detection
    const initialResult = runFullDetection()
    setResult(initialResult)
    if (initialResult.isBot || initialResult.shouldLogout) {
      onBotDetected?.(initialResult)
    }
    
    // Periodic checks
    const checkInterval = setInterval(() => {
      const newResult = runFullDetection()
      setResult(newResult)
      
      if (newResult.isBot || newResult.shouldLogout) {
        onBotDetected?.(newResult)
      }
    }, BOT_DETECTION_CONFIG.BEHAVIOR_CHECK_INTERVAL)
    
    // Cleanup
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("click", handleClick)
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("keyup", handleKeyUp)
      clearInterval(checkInterval)
      cleanupPaste()
    }
  }, [runFullDetection, setupConsolePasteDetection, onBotDetected])
  
  // Force re-check on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const newResult = runFullDetection()
        setResult(newResult)
        if (newResult.isBot || newResult.shouldLogout) {
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

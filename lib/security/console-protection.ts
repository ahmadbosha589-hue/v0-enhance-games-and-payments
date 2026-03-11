// =====================================================
// CONSOLE PROTECTION
// Blocks paste operations in console and detects
// attempts to tamper with the application
// =====================================================

/**
 * Initialize console protection
 * Should be called early in the application lifecycle
 */
export function initConsoleProtection(): void {
  if (typeof window === "undefined") return
  if (process.env.NODE_ENV === "development") return

  // Store original console methods
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
    clear: console.clear,
  }

  // Flag for tracking suspicious activity
  let suspiciousActivityCount = 0
  const MAX_SUSPICIOUS_BEFORE_ALERT = 3

  // Warn users about console dangers
  const warnOnceKey = "__console_warned__"
  if (!(window as any)[warnOnceKey]) {
    (window as any)[warnOnceKey] = true
    
    // Display warning in console
    setTimeout(() => {
      console.log(
        "%c⚠️ STOP!",
        "color: red; font-size: 48px; font-weight: bold; text-shadow: 2px 2px 0 black;"
      )
      console.log(
        "%cThis is a browser feature intended for developers. " +
        "If someone told you to copy-paste something here, " +
        "it is likely a scam and could compromise your account.",
        "color: red; font-size: 16px;"
      )
      console.log(
        "%cPasting code here may allow attackers to steal your funds and data.",
        "color: orange; font-size: 14px;"
      )
    }, 1000)
  }

  // Create a function to detect eval/Function usage
  const createEvalTrap = () => {
    try {
      // Override eval
      const originalEval = (window as any).eval
      Object.defineProperty(window, "eval", {
        get() {
          suspiciousActivityCount++
          reportSuspiciousActivity("eval_access")
          
          return function(code: string) {
            console.error("%c⛔ eval() is disabled for security reasons", "color: red; font-weight: bold;")
            reportSuspiciousActivity("eval_execution", { codeLength: code?.length })
            throw new Error("eval() is disabled for security")
          }
        },
        set() {
          // Prevent overwriting
        },
        configurable: false,
      })
    } catch {
      // Protection failed, continue
    }

    try {
      // Override Function constructor
      const OriginalFunction = Function
      Object.defineProperty(window, "Function", {
        get() {
          suspiciousActivityCount++
          return function(...args: any[]) {
            console.error("%c⛔ Function constructor is disabled for security", "color: red; font-weight: bold;")
            reportSuspiciousActivity("function_constructor", { argsCount: args.length })
            throw new Error("Function constructor is disabled for security")
          }
        },
        set() {
          // Prevent overwriting
        },
        configurable: false,
      })
    } catch {
      // Protection failed, continue
    }
  }

  // Report suspicious activity to server
  const reportSuspiciousActivity = async (type: string, details?: Record<string, any>) => {
    try {
      await fetch("/api/security/bot-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threats: [`Console tampering: ${type}`],
          score: 60,
          threatLevel: "high",
          timestamp: Date.now(),
          details,
        }),
      })
    } catch {
      // Silent fail
    }

    if (suspiciousActivityCount >= MAX_SUSPICIOUS_BEFORE_ALERT) {
      alert(
        "Security Alert: Multiple suspicious activities detected. " +
        "Your session may be logged out for security reasons."
      )
    }
  }

  // Monitor for devtools open (multiple methods)
  const detectDevTools = () => {
    const widthThreshold = 160
    const heightThreshold = 160
    
    const isDevToolsOpen = 
      window.outerWidth - window.innerWidth > widthThreshold ||
      window.outerHeight - window.innerHeight > heightThreshold

    return isDevToolsOpen
  }

  // Prevent paste events in unexpected places
  const handlePaste = (e: ClipboardEvent) => {
    const target = e.target as HTMLElement
    
    // Allow paste in form inputs
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return
    }

    // Get clipboard content
    const clipboardData = e.clipboardData?.getData("text") || ""

    // Check for dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/i,
      /Function\s*\(/i,
      /document\.cookie/i,
      /localStorage/i,
      /sessionStorage/i,
      /XMLHttpRequest/i,
      /fetch\s*\(/i,
      /\.click\s*\(/i,
      /\.submit\s*\(/i,
      /innerHTML\s*=/i,
      /outerHTML\s*=/i,
      /\$\(.*\)/,  // jQuery
      /document\.write/i,
      /window\.location/i,
      /document\.location/i,
      /script/i,
      /onerror\s*=/i,
      /onload\s*=/i,
      /javascript:/i,
      /data:/i,
      /base64/i,
      /GM_/,  // Greasemonkey
      /unsafeWindow/,
      /chrome\.runtime/,
      /browser\.runtime/,
      /\.execCommand/i,
      /\.execScript/i,
      /setInterval\s*\(/i,
      /setTimeout\s*\(/i,
      /Promise\s*\./i,
      /async\s+function/i,
      /await\s+/i,
      /import\s*\(/i,
      /require\s*\(/i,
      /module\.exports/i,
      /__proto__/i,
      /prototype/i,
      /constructor\s*\[/i,
    ]

    const isDangerous = dangerousPatterns.some(pattern => pattern.test(clipboardData))

    if (isDangerous) {
      e.preventDefault()
      e.stopPropagation()
      
      suspiciousActivityCount++
      console.error("%c⛔ Blocked: Suspicious code paste detected", "color: red; font-weight: bold;")
      reportSuspiciousActivity("dangerous_paste", { 
        contentLength: clipboardData.length,
        preview: clipboardData.substring(0, 100) 
      })

      // Show user warning
      alert(
        "Security Warning: Code paste blocked!\n\n" +
        "Never paste code from unknown sources into your browser. " +
        "This could compromise your account and funds."
      )
    }
  }

  // Block keyboard shortcuts for devtools
  const handleKeyDown = (e: KeyboardEvent) => {
    // F12
    if (e.key === "F12") {
      e.preventDefault()
      suspiciousActivityCount++
    }

    // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
    if (e.ctrlKey && e.shiftKey && ["I", "J", "C", "K"].includes(e.key.toUpperCase())) {
      e.preventDefault()
      suspiciousActivityCount++
    }

    // Ctrl+U (View Source)
    if (e.ctrlKey && e.key.toLowerCase() === "u") {
      e.preventDefault()
    }
  }

  // Detect debugger usage
  const detectDebugger = () => {
    const start = performance.now()
    // This will pause execution if debugger is open
    ;(() => { debugger })()
    const end = performance.now()
    
    // If it took more than 50ms, debugger was likely active
    if (end - start > 50) {
      suspiciousActivityCount++
      reportSuspiciousActivity("debugger_detected")
    }
  }

  // Initialize protections
  createEvalTrap()
  document.addEventListener("paste", handlePaste, true)
  document.addEventListener("keydown", handleKeyDown, true)

  // Periodic debugger check (only in production, every 5 seconds)
  if (process.env.NODE_ENV === "production") {
    setInterval(detectDebugger, 5000)
  }

  // Monitor for tampering with console
  setInterval(() => {
    try {
      // Check if console has been tampered with
      if (console.log.toString().indexOf("[native code]") === -1) {
        suspiciousActivityCount++
        reportSuspiciousActivity("console_tampered")
      }
    } catch {
      // Error checking console, might be tampered
    }
  }, 10000)
}

/**
 * Disable console in production
 * Makes it harder for attackers to debug the application
 */
export function disableConsoleInProduction(): void {
  if (typeof window === "undefined") return
  if (process.env.NODE_ENV === "development") return

  // Override console methods with no-ops
  const noop = () => {}
  
  // Keep error for legitimate error tracking
  const methods = ["log", "info", "debug", "warn", "table", "dir", "trace"] as const
  
  methods.forEach(method => {
    (console as any)[method] = noop
  })
}

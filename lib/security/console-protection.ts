// =====================================================
// CONSOLE PROTECTION
// Safe version - removed dangerous overrides that
// broke Supabase auth and caused false logouts:
//
// REMOVED: createEvalTrap() — was overriding window.Function
//   as a non-configurable getter. This broke Supabase's
//   internal use of Function, caused alert() popups after
//   just 3 library accesses, and triggered SIGNED_OUT events.
//
// REMOVED: setInterval(detectDebugger, 5000) — was executing
//   a `debugger` statement every 5 seconds in production,
//   pausing all JS execution when devtools were open.
// =====================================================

/**
 * Initialize console protection
 * Shows a social-engineering warning in the console.
 * Safe version: no eval/Function overrides, no debugger traps.
 */
export function initConsoleProtection(): void {
  if (typeof window === "undefined") return
  if (process.env.NODE_ENV === "development") return

  // Warn users about console dangers (social engineering attacks)
  const warnOnceKey = "__console_warned__"
  if (!(window as any)[warnOnceKey]) {
    ; (window as any)[warnOnceKey] = true

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

  // Block paste of obviously dangerous code outside of form inputs
  const handlePaste = (e: ClipboardEvent) => {
    const target = e.target as HTMLElement
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return // allow paste in form fields
    }

    const clipboardData = e.clipboardData?.getData("text") || ""
    const dangerousPatterns = [
      /eval\s*\(/i,
      /document\.cookie/i,
      /localStorage/i,
      /sessionStorage/i,
      /XMLHttpRequest/i,
      /\.execCommand/i,
      /javascript:/i,
    ]

    if (dangerousPatterns.some((p) => p.test(clipboardData))) {
      e.preventDefault()
      e.stopPropagation()
      console.error(
        "%c⛔ Blocked: Suspicious code paste detected",
        "color: red; font-weight: bold;"
      )
      alert(
        "Security Warning: Code paste blocked!\n\n" +
        "Never paste code from unknown sources into your browser."
      )
    }
  }

  document.addEventListener("paste", handlePaste, true)
}

/**
 * No-op kept for import compatibility.
 * Disabling console in production is counterproductive —
 * it breaks error monitoring and was patching console.log,
 * which then triggered the tamper-detection interval.
 */
export function disableConsoleInProduction(): void {
  // intentionally left empty
}
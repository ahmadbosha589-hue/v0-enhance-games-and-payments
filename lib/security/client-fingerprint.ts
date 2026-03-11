/**
 * Client-side device fingerprint generation.
 *
 * Produces a SHA-256 hash derived entirely from hardware / browser properties
 * (canvas, WebGL, audio context, screen, navigator, etc.).
 *
 * Because the fingerprint is computed from intrinsic device characteristics it
 * survives clearing cookies, localStorage, sessionStorage, and the browser
 * cache.  The only things that change the hash are real hardware or major
 * browser-version differences.
 */

export interface ClientDeviceInfo {
  screenResolution: string
  colorDepth: number
  timezone: string
  timezoneOffset: number
  language: string
  languages: string
  platform: string
  userAgent: string
  hardwareConcurrency: number
  deviceMemory: number
  pluginCount: number
  canvasHash: string
  webglVendor: string
  webglRenderer: string
  audioSampleRate: string
}

export async function generateDeviceFingerprint(): Promise<string> {
  const components: string[] = []

  // Screen info
  components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`)
  components.push(`${screen.availWidth}x${screen.availHeight}`)

  // Timezone
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone)
  components.push(String(new Date().getTimezoneOffset()))

  // Language and platform
  components.push(navigator.language)
  components.push(navigator.languages?.join(",") || "")
  components.push(navigator.platform)
  components.push(navigator.userAgent)

  // Hardware
  components.push(String(navigator.hardwareConcurrency || 0))
  components.push(String((navigator as unknown as { deviceMemory?: number }).deviceMemory || 0))

  // Plugins count
  components.push(String(navigator.plugins?.length || 0))

  // Canvas fingerprint
  try {
    const canvas = document.createElement("canvas")
    canvas.width = 200
    canvas.height = 50
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.textBaseline = "top"
      ctx.font = "14px Arial"
      ctx.fillStyle = "#f60"
      ctx.fillRect(125, 1, 62, 20)
      ctx.fillStyle = "#069"
      ctx.fillText("fingerprint", 2, 15)
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)"
      ctx.fillText("fingerprint", 4, 17)
      components.push(canvas.toDataURL())
    }
  } catch {
    components.push("no-canvas")
  }

  // WebGL renderer
  try {
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
    if (gl && gl instanceof WebGLRenderingContext) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info")
      if (debugInfo) {
        components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "")
        components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "")
      }
    }
  } catch {
    components.push("no-webgl")
  }

  // Audio fingerprint
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const audioContext = new AudioCtx()
    components.push(String(audioContext.sampleRate))
    audioContext.close()
  } catch {
    components.push("no-audio")
  }

  // Hash the components
  const fingerprint = components.join("|")
  const encoder = new TextEncoder()
  const data = encoder.encode(fingerprint)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Collect rich device info for server-side storage alongside the hash.
 */
export function collectDeviceInfo(): Partial<ClientDeviceInfo> {
  const info: Partial<ClientDeviceInfo> = {}

  try {
    info.screenResolution = `${screen.width}x${screen.height}`
    info.colorDepth = screen.colorDepth
    info.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    info.timezoneOffset = new Date().getTimezoneOffset()
    info.language = navigator.language
    info.languages = navigator.languages?.join(",") || ""
    info.platform = navigator.platform
    info.userAgent = navigator.userAgent
    info.hardwareConcurrency = navigator.hardwareConcurrency || 0
    info.deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 0
    info.pluginCount = navigator.plugins?.length || 0
  } catch {
    // Silently handle any collection errors
  }

  return info
}

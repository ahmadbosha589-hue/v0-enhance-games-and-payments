// =============================================================================
// HONEYPOT REQUEST LOGGER v5.0
// =============================================================================
// Logs requests to honeypot endpoints for server-side verification
// This is the SOURCE OF TRUTH - client reports are NEVER trusted
// Only what the server receives counts for detection
// =============================================================================

import { headers } from "next/headers"
import { logHoneypotRequest } from "./server-fortress"

/**
 * Log a honeypot probe request
 * Call this from honeypot endpoint handlers
 * This creates the SERVER-SIDE verification record
 */
export async function logHoneypotProbeRequest(probeId: string): Promise<void> {
  try {
    const headersList = await headers()
    
    // Get session ID from request headers (client should send this)
    const sessionId = headersList.get("x-session-id") || 
                      headersList.get("x-adblock-session") ||
                      headersList.get("x-request-id")
    
    if (sessionId) {
      // Log timing and additional context
      const responseCode = 200 // Success since we're in the handler
      const timing = parseInt(headersList.get("x-request-start") || "0", 10)
      const requestHeaders: Record<string, string> = {}
      
      // Capture relevant headers for analysis
      const relevantHeaders = [
        "user-agent", "accept", "accept-language", "accept-encoding",
        "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest",
        "cache-control", "pragma"
      ]
      
      for (const header of relevantHeaders) {
        const value = headersList.get(header)
        if (value) requestHeaders[header] = value
      }
      
      // Log that this probe was successfully received by server
      logHoneypotRequest(sessionId, probeId, true, { 
        responseCode, 
        timing: timing > 0 ? Date.now() - timing : undefined,
        headers: requestHeaders
      })
    }
  } catch {
    // Ignore logging errors - don't break the probe
  }
}

/**
 * Create standard honeypot response headers
 */
export function getHoneypotHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Content-Type-Options": "nosniff",
    "X-Honeypot": "1", // Debug marker
  }
}

/**
 * Create a JavaScript honeypot response
 */
export function createJSHoneypotResponse(probeId: string): Response {
  const js = `(function(){window.__honeypot_${probeId.replace(/-/g, "_")}=true;})();`
  return new Response(js, {
    headers: {
      ...getHoneypotHeaders(),
      "Content-Type": "application/javascript",
    },
  })
}

/**
 * Create a GIF honeypot response (1x1 transparent pixel)
 */
export function createGIFHoneypotResponse(): Response {
  // 1x1 transparent GIF
  const gif = Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
    0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
    0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
    0x01, 0x00, 0x3b
  ])
  
  return new Response(gif, {
    headers: {
      ...getHoneypotHeaders(),
      "Content-Type": "image/gif",
    },
  })
}

/**
 * Create a PNG honeypot response (1x1 transparent pixel)
 */
export function createPNGHoneypotResponse(): Response {
  // 1x1 transparent PNG
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82
  ])
  
  return new Response(png, {
    headers: {
      ...getHoneypotHeaders(),
      "Content-Type": "image/png",
    },
  })
}

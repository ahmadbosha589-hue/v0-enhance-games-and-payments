// =====================================================
// Security Headers Configuration
// =====================================================

export const securityHeaders = {
  // Content Security Policy
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://js.hcaptcha.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.faucetpay.io https://hcaptcha.com",
    "frame-src https://challenges.cloudflare.com https://hcaptcha.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; "),

  // Strict Transport Security
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",

  // Prevent clickjacking
  "X-Frame-Options": "DENY",

  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",

  // Referrer Policy
  "Referrer-Policy": "strict-origin-when-cross-origin",

  // Permissions Policy
  "Permissions-Policy": [
    "accelerometer=()",
    "camera=()",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "payment=()",
    "usb=()",
  ].join(", "),

  // XSS Protection (legacy but still useful)
  "X-XSS-Protection": "1; mode=block",

  // DNS Prefetch Control
  "X-DNS-Prefetch-Control": "on",
}

export function getSecurityHeaders(): HeadersInit {
  return securityHeaders
}

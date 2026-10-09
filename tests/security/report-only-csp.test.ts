import { describe, expect, it } from "vitest"
import nextConfig from "@/next.config.mjs"

describe("enforcing CSP headers", () => {
  it("publishes the enforced policy with core protections and integration allowlists", async () => {
    const headerGroups = await nextConfig.headers()
    const globalHeaders = headerGroups.find((group) => group.source === "/:path*")

    expect(globalHeaders).toBeDefined()

    const headers = new Map(globalHeaders?.headers.map(({ key, value }) => [key, value]))
    const csp = headers.get("Content-Security-Policy")

    expect(csp).toBeDefined()
    expect(headers.has("Content-Security-Policy-Report-Only")).toBe(false)
    expect(csp).not.toContain("'sha256-")

    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "https://challenges.cloudflare.com",
      "https://js.hcaptcha.com",
      "https://hcaptcha.com",
      "https://*.hcaptcha.com",
      "https://c.cx.ua",
      "https://sad.adsgram.ai",
      "https://a-ads.com",
      "https://coinzillatag.com",
      "https://bitmedianetwork.com",
      "style-src 'self'",
      "img-src 'self' data: blob: https:",
      "connect-src 'self'",
      "https://api.adsgram.ai",
      "media-src 'self' blob: https:",
      "worker-src 'self' blob:",
      "frame-src 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
      "report-uri /api/security/csp-report",
    ]) {
      expect(csp).toContain(directive)
    }
  })
})

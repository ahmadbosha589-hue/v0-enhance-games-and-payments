import { describe, expect, it } from "vitest"
import nextConfig from "@/next.config.mjs"

describe("Phase 02b report-only CSP", () => {
  it("publishes only the report-only policy with the required safety directives", async () => {
    const headerGroups = await nextConfig.headers()
    const globalHeaders = headerGroups.find((group) => group.source === "/:path*")

    expect(globalHeaders).toBeDefined()

    const headers = new Map(globalHeaders?.headers.map(({ key, value }) => [key, value]))
    const reportOnly = headers.get("Content-Security-Policy-Report-Only")

    expect(headers.has("Content-Security-Policy")).toBe(false)
    expect(reportOnly).toBeDefined()

    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob: https:",
      "connect-src 'self'",
      "frame-src 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "report-uri /api/security/csp-report",
    ]) {
      expect(reportOnly).toContain(directive)
    }
  })
})

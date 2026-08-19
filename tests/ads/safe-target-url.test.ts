import { describe, expect, it } from "vitest"
import { isSafeTargetUrl } from "@/lib/ads/safe-target-url"

describe("advertiser target URL validation", () => {
  it("allows HTTPS public destinations", () => {
    expect(isSafeTargetUrl("https://example.com/landing?campaign=1")).toBe(true)
  })

  it("rejects non-HTTPS and local destinations", () => {
    expect(isSafeTargetUrl("http://example.com")).toBe(false)
    expect(isSafeTargetUrl("https://localhost/admin")).toBe(false)
    expect(isSafeTargetUrl("https://127.0.0.1/internal")).toBe(false)
    expect(isSafeTargetUrl("https://10.0.0.5/private")).toBe(false)
    expect(isSafeTargetUrl("https://[::1]/private")).toBe(false)
  })

  it("rejects credential-bearing URLs and malformed values", () => {
    expect(isSafeTargetUrl("https://user:pass@example.com")).toBe(false)
    expect(isSafeTargetUrl("javascript:alert(1)")).toBe(false)
    expect(isSafeTargetUrl("not a URL")).toBe(false)
  })
})

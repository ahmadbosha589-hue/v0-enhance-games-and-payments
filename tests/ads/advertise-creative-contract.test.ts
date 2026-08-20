import { describe, expect, it } from "vitest"
import { validateCreativeUrl } from "@/lib/ads/campaign-contract"

describe("advertiser creative contract", () => {
  it("accepts only public HTTPS creative URLs", () => {
    expect(validateCreativeUrl("https://cdn.example.test/creative.png")).toBe(true)
    expect(validateCreativeUrl("http://cdn.example.test/creative.png")).toBe(false)
    expect(validateCreativeUrl("https://127.0.0.1/creative.png")).toBe(false)
    expect(validateCreativeUrl("not-a-url")).toBe(false)
  })

  it("rejects empty creative values", () => {
    expect(validateCreativeUrl(undefined)).toBe(false)
    expect(validateCreativeUrl("")).toBe(false)
  })
})

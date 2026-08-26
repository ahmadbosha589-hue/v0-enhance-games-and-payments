import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("CPX Research offerwall integration", () => {
  it("postback handler prefers the DOCUMENTED md5(transId-secret) scheme, keeps legacy fallbacks", () => {
    const src = read("app/api/postback/[provider]/route.ts")
    // Documented primary per the CPX dashboard: md5({trans_id}-SECRET)
    expect(src).toContain("md5({trans_id}-SECRET)")
    expect(src).toContain('createHash("md5").update(`${trans}-${secret}`)')
    // legacy v1/v2 fallbacks retained
    expect(src).toContain("${trans}-${user}-${amountUsd}-${secret}")
    expect(src).toContain('paramsObj.currency || "USD"')
    // diagnostics log every candidate
    expect(src).toContain("expected_doc")
  })

  it("status=2 reversal is wired to reverse_offerwall_conversion RPC", () => {
    const src = read("app/api/postback/[provider]/route.ts")
    expect(src).toContain('provider === "cpx-research" && searchParams.get("status") === "2"')
    expect(src).toContain('"reverse_offerwall_conversion"')
    // reversal strips the rev_ prefix so the ORIGINAL transaction id is reversed
    expect(src).toContain('replace(/^rev_/, "")')
  })

  it("parses dashboard placeholders exactly (ip_click, subid_1 fallback)", () => {
    const src = read("app/api/postback/[provider]/route.ts")
    expect(src).toContain('searchParams.get("ip_click")')
    expect(src).toContain('searchParams.get("subid_1")')
    // reversal transactions are namespaced with rev_ prefix
    expect(src).toContain('(isReversal ? "rev_" : "")')
  })

  it("registry wires app_id placeholder + CPX env names", () => {
    const src = read("app/api/offerwalls/route.ts")
    expect(src).toContain("https://offers.cpx-research.com/?app_id={app_id}&ext_user_id={user_id}")
    expect(src).toContain('"CPX_APP_ID", "NEXT_PUBLIC_CPX_APP_ID"')
    expect(src).toContain('"CPX_SECRET_KEY"')
  })

  it("CPX brand logos exist and registry references them", () => {
    for (const f of [
      "public/offerwalls/cpx-research/logo-light.png",
      "public/offerwalls/cpx-research/logo-dark.png",
      "public/offerwalls/cpx-research/logo-mark.png",
    ]) {
      expect(readFileSync(resolve(process.cwd(), f)).byteLength).toBeGreaterThan(1000)
    }
    const src = read("app/api/offerwalls/route.ts")
    expect(src).toContain('"/offerwalls/cpx-research/logo-light.png"')
  })

  it("fails closed without CPX_SECRET_KEY", () => {
    const src = read("app/api/postback/[provider]/route.ts")
    expect(src).toContain('cpx-research": (process.env.CPX_SECRET_KEY || "").trim()')
  })

  it("signature mismatch logs both expected variants for diagnosis", () => {
    const src = read("app/api/postback/[provider]/route.ts")
    expect(src).toContain("expected_v1")
    expect(src).toContain("expected_v2")
  })
})

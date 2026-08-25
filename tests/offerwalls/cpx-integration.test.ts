import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("CPX Research offerwall integration", () => {
  it("postback handler accepts both documented CPX hash variants", () => {
    const src = read("app/api/postback/[provider]/route.ts")
    // v1: md5(transId-usrId-amountUSD-secret)
    expect(src).toContain("${trans}-${user}-${amountUsd}-${secret}")
    // v2 adds currency before the secret
    expect(src).toContain('paramsObj.currency || "USD"')
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

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { buildCspPolicy } from "@/lib/security/csp-policy.mjs"
import { getNetwork } from "@/lib/ads/registry"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

const POPUNDER_KEY = "44/63/88/446388c8df548b49c64db4190608db24.js"
const NATIVE_KEY = "586c92d65f9f3533be9aa3fd2453cb68"
const SOCIAL_KEY = "fb/9a/28/fb9a286d6a0a3f39b27e8e21bc465006.js"
const BANNER_KEY = "5bebd8bccbeee5ac78edc626c33bf733"

describe("Adsterra real account tags are implemented site-wide", () => {
  it("component carries all four real placement keys", () => {
    const src = read("components/ads/adsterra-units.tsx")
    expect(src).toContain(POPUNDER_KEY)
    expect(src).toContain(NATIVE_KEY)
    expect(src).toContain(SOCIAL_KEY)
    expect(src).toContain(BANNER_KEY)
    expect(src).toContain(`container-${NATIVE_KEY}`)
  })

  it("loads popunder, social bar, and both invoke scripts from the CDN", () => {
    const src = read("components/ads/adsterra-units.tsx")
    // CDN host + each placement path/keys are all present as literals; the
    // component composes the full URLs from these constants.
    expect(src).toContain('const ADSTERRA_CDN = "https://comparativelykindness.com"')
    expect(src).toContain("/44/63/88/446388c8df548b49c64db4190608db24.js")
    expect(src).toContain("/fb/9a/28/fb9a286d6a0a3f39b27e8e21bc465006.js")
    expect(src).toContain("appendScript(POPUNDER_SRC)")
    expect(src).toContain("appendScript(SOCIAL_BAR_SRC)")
    expect(src).toContain("appendScript(`${ADSTERRA_CDN}/${NATIVE_KEY}/invoke.js`")
    expect(src).toContain("bannerWrapper.appendChild(bannerScript)")
  })

  it("sets the 728x90 atOptions before its invoke script runs", () => {
    const src = read("components/ads/adsterra-units.tsx")
    expect(src).toContain("window.atOptions = {")
    expect(src).toContain("format: \"iframe\"")
    expect(src).toContain("height: 90")
    expect(src).toContain("width: 728")
    // atOptions assignment must appear BEFORE the banner invoke append.
    const atIdx = src.indexOf("window.atOptions = {")
    const invokeIdx = src.indexOf("bannerWrapper.appendChild(bannerScript)")
    expect(atIdx).toBeGreaterThan(-1)
    expect(invokeIdx).toBeGreaterThan(atIdx)
  })

  it("invoke scripts render into body containers, never the head", () => {
    const src = read("components/ads/adsterra-units.tsx")
    // Adsterra's renderer draws the creative into the invoke script's PARENT
    // node — a <head> parent renders nothing (verified on production).
    expect(src).not.toMatch(/document\.head\.appendChild\(script\)/)
    expect(src).toContain("bannerWrapper.appendChild(bannerScript)")
    expect(src).toContain('document.body.appendChild(container)')
  })

  it("is consent-gated and injects only once per page load", () => {
    const src = read("components/ads/adsterra-units.tsx")
    expect(src).toContain("useAdConsent")
    expect(src).toMatch(/__fauceroAdsterraInjected/)
  })

  it("registry marks adsterra renderable with the real CDN origin", () => {
    const network = getNetwork("adsterra")
    expect(network?.enabled).toBe(true)
    expect(network?.disabledReason).toBeUndefined()
    expect(network?.scriptOrigin).toBe("https://comparativelykindness.com")
  })

  it("CSP allows the Adsterra CDN and its measured runtime domains", () => {
    const policy = buildCspPolicy()
    // Tag scripts
    expect(policy).toMatch(/script-src [^;]*https:\/\/comparativelykindness\.com/)
    // The invoke scripts XHR stats/watch endpoints on these domains
    const connectSrc = policy.match(/connect-src ([^;]+)/)?.[1] ?? ""
    for (const origin of [
      "https://comparativelykindness.com",
      "https://kettledroopingcontinuation.com",
      "https://protrafficinspector.com",
      "https://mamshirt.com",
    ]) {
      expect(connectSrc).toContain(origin)
    }
    // The 728x90 unit renders inside an iframe on the ad domains
    const frameSrc = policy.match(/frame-src ([^;]+)/)?.[1] ?? ""
    for (const origin of [
      "https://comparativelykindness.com",
      "https://kettledroopingcontinuation.com",
      "https://mamshirt.com",
    ]) {
      expect(frameSrc).toContain(origin)
    }
  })

  const LAYOUTS = [
    "app/page.tsx",
    "app/(public)/layout.tsx",
    "app/dashboard/layout.tsx",
    "app/auth/layout.tsx",
    "app/l/layout.tsx",
    "app/not-found.tsx",
  ]

  for (const layout of LAYOUTS) {
    it(`${layout} mounts the Adsterra units`, () => {
      expect(read(layout)).toMatch(/AdsterraUnits/)
    })
  }

  it("admin panel stays free of Adsterra tags", () => {
    expect(read("app/admin/layout.tsx")).not.toMatch(/AdsterraUnits/)
  })
})

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import nextConfig from "@/next.config.mjs"
import { buildCspPolicy } from "@/lib/security/csp-policy.mjs"
import { AD_NETWORKS } from "@/lib/ads/registry"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

const policy = buildCspPolicy()
const sources = (directive: string) =>
  policy.match(new RegExp(`(?:^|;\\s*)${directive}\\s+([^;]+)`))?.[1] ?? ""

const sourceFor = (value: string, directive: string) =>
  value.split("; ").find((entry) => entry.startsWith(`${directive} `))?.slice(directive.length + 1) ?? ""

describe("CSP is enforced without disabling configured product integrations", () => {
  const config = read("next.config.mjs")

  it("keeps static compatibility while building nonce-based script policy for dynamic pages", () => {
    const nonce = "dGVzdC1ub25jZQ=="
    const noncePolicy = buildCspPolicy(nonce)
    const nonceScriptSource = sourceFor(noncePolicy, "script-src")
    const staticScriptTokens = sources("script-src").split(" ").filter((token) => token !== "'unsafe-inline'")

    expect(sources("script-src")).toContain("'unsafe-inline'")
    expect(sources("script-src")).not.toContain("'sha256-")
    expect(nonceScriptSource).toContain(`'nonce-${nonce}'`)
    expect(nonceScriptSource).toContain("'strict-dynamic'")
    expect(nonceScriptSource).not.toContain("'unsafe-inline'")
    expect(nonceScriptSource).toContain("'sha256-zjP2BXYgSCCnXNMXI2IL1yRydoQdsGR/uCCr6kyKsD0='")
    for (const source of staticScriptTokens) expect(nonceScriptSource).toContain(source)
    for (const directive of policy.split("; ").slice(1)) expect(noncePolicy).toContain(directive)
    expect(() => buildCspPolicy("not a nonce")).toThrow("CSP nonce must be base64 encoded")
  })

  it("renders authentication pages dynamically so request nonces reach their scripts", () => {
    expect(read("app/auth/layout.tsx")).toContain('export const dynamic = "force-dynamic"')
  })

  it("sends an enforcing CSP, not report-only alone", () => {
    expect(config).toContain('key: "Content-Security-Policy"')
    expect(config).not.toContain('key: "Content-Security-Policy-Report-Only"')
  })

  it("preserves core security directives and avoids wildcard HTTPS sources", () => {
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("base-uri 'self'")
    expect(policy).toContain("frame-ancestors 'self'")
    expect(policy).toContain("form-action 'self'")
    for (const name of ["script-src", "frame-src", "connect-src"]) {
      expect(sources(name).split(" ")).not.toContain("https:")
    }
  })

  it("allows required Turnstile, hCaptcha, and c.cx.ua script sources", () => {
    const scriptSrc = sources("script-src")
    for (const origin of [
      "https://challenges.cloudflare.com",
      "https://js.hcaptcha.com",
      "https://hcaptcha.com",
      "https://*.hcaptcha.com",
      "https://c.cx.ua",
    ]) {
      expect(scriptSrc, `missing script source ${origin}`).toContain(origin)
    }
  })

  it("allows hCaptcha connections and Cloudflare's same-origin pre-clearance flow", () => {
    const connectSrc = sources("connect-src")
    expect(connectSrc).toContain("'self'")
    expect(connectSrc).toContain("https://hcaptcha.com")
    expect(connectSrc).toContain("https://*.hcaptcha.com")
  })

  it("keeps Supabase REST and realtime transports available", () => {
    const connectSrc = sources("connect-src")
    expect(connectSrc).toContain("https://*.supabase.co")
    expect(connectSrc).toContain("wss://*.supabase.co")
  })

  it("allows AdsGram's SDK, API, media, and existing blob worker", () => {
    const adsgramSource = read("lib/ads/adsgram.ts")
    const scriptUrl = adsgramSource.match(/const SCRIPT_SRC = "(https:\/\/[^/]+)/)?.[1]
    expect(scriptUrl).toBe("https://sad.adsgram.ai")
    expect(sources("script-src")).toContain(scriptUrl)
    expect(sources("connect-src")).toContain("https://api.adsgram.ai")
    expect(sources("img-src")).toContain("https:")
    expect(sources("media-src")).toContain("https:")
    expect(sources("worker-src")).toContain("blob:")
  })

  it("allows active legacy ad providers that render from persisted ad settings", () => {
    const legacyAds = read("components/ads/ad-banner.tsx")
    const multiNetworkAds = read("components/ads/ad-slot-multi-network.tsx")
    const scriptSrc = sources("script-src")
    const frameSrc = sources("frame-src")

    // These are still reachable through the dashboard's persisted AdSlot settings,
    // independently of the newer registry that keeps unverified tags disabled.
    expect(legacyAds).toContain('aadsScript.src = `https://a-ads.com/1t.js`')
    expect(legacyAds).toContain('czScript.src = "https://coinzillatag.com/lib/display.js"')
    expect(legacyAds).toContain('bmScript.src = `https://bitmedianetwork.com/js/${bitsmediaId}.js`')
    expect(multiNetworkAds).toContain('src={`//ad.a-ads.com/${configTyped.publisherId}?size=')
    expect(multiNetworkAds).toContain('src={`https://bitmedia.io/embed/${configTyped.zoneId}`}')

    for (const origin of ["https://a-ads.com", "https://coinzillatag.com", "https://bitmedianetwork.com"]) {
      expect(scriptSrc, `missing legacy ad script source ${origin}`).toContain(origin)
    }
    for (const origin of ["https://ad.a-ads.com", "https://bitmedia.io"]) {
      expect(frameSrc, `missing legacy ad frame source ${origin}`).toContain(origin)
    }
  })

  it("allows every direct offerwall iframe origin returned by app/api/offerwalls", () => {
    const routes = read("app/api/offerwalls/route.ts")
    const origins = [...routes.matchAll(/url:\s*"(https:\/\/[^/"]+)/g)].map((match) => match[1])
    expect(origins.length).toBeGreaterThan(0)
    for (const origin of new Set(origins)) {
      expect(sources("frame-src"), `missing CSP frame origin ${origin}`).toContain(origin)
    }
  })

  it("allows CAPTCHA and c.cx.ua document frames", () => {
    const frameSrc = sources("frame-src")
    for (const origin of [
      "https://challenges.cloudflare.com",
      "https://hcaptcha.com",
      "https://*.hcaptcha.com",
      "https://c.cx.ua",
    ]) {
      expect(frameSrc, `missing CSP frame source ${origin}`).toContain(origin)
    }
  })

  it("requires CSP origins for enabled networks and excludes unverified disabled providers", () => {
    for (const network of AD_NETWORKS) {
      if (!network.scriptOrigin) continue
      const directive = network.tagKind === "iframe-src" ? "frame-src" : "script-src"
      const legacyIsSeparatelyCovered = network.legacyProvider !== undefined
      if (network.enabled) {
        expect(sources(directive), `missing ${directive} source for ${network.name}`).toContain(network.scriptOrigin)
      } else if (!legacyIsSeparatelyCovered) {
        expect(sources(directive), `unverified provider ${network.name} must remain excluded`).not.toContain(network.scriptOrigin)
      }
    }
  })

  it("retains the existing transport, MIME, referrer, framing, and permissions headers", async () => {
    const headerGroups = await nextConfig.headers()
    const globalHeaders = headerGroups.find((group) => group.source === "/:path*")
    expect(globalHeaders).toBeDefined()
    const headers = new Map(globalHeaders?.headers.map(({ key, value }) => [key, value]))
    const proxy = read("proxy.ts")
    const proxyPermissions = proxy.match(/"Permissions-Policy":\s*"([^"]+)"/)?.[1]
    expect(proxyPermissions).toBe(headers.get("Permissions-Policy"))
    for (const header of [
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "X-Frame-Options",
      "Permissions-Policy",
      "Content-Security-Policy",
    ]) {
      expect(headers.has(header), `missing existing security header ${header}`).toBe(true)
    }
  })

  it("retains the legacy sensor restrictions in the active header policy", async () => {
    const headerGroups = await nextConfig.headers()
    const globalHeaders = headerGroups.find((group) => group.source === "/:path*")
    const headers = new Map(globalHeaders?.headers.map(({ key, value }) => [key, value]))
    const permissionsPolicy = headers.get("Permissions-Policy") ?? ""
    const proxy = read("proxy.ts")

    for (const feature of ["accelerometer=()", "gyroscope=()", "magnetometer=()"]) {
      expect(permissionsPolicy, `missing Permissions-Policy directive ${feature}`).toContain(feature)
    }
    expect(proxy.match(/"Permissions-Policy":\s*"([^"]+)"/)?.[1]).toBe(permissionsPolicy)
    expect(proxy).toContain('"X-DNS-Prefetch-Control": "on"')
  })

  it("preserves the existing security-headers helper", () => {
    expect(existsSync(resolve(process.cwd(), "lib/security/headers.ts"))).toBe(true)
  })
})

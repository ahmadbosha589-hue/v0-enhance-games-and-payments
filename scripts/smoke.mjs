#!/usr/bin/env node
// Anonymous reachability smoke test for stable public pages and GET endpoints.
// Usage: npm run smoke -- --base-url https://www.faucero.com
// Or set SMOKE_BASE_URL; defaults to http://127.0.0.1:3000.
const args = process.argv.slice(2)
const baseUrlIndex = args.indexOf("--base-url")
const BASE = baseUrlIndex >= 0 ? args[baseUrlIndex + 1] : process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000"
const PATHS = [
  "/",
  "/auth/login",
  "/about",
  "/contact",
  "/help",
  "/status",
  "/terms",
  "/privacy",
  "/cookies",
  "/aml",
  "/blog",
  "/docs/api",
  "/api/health",
  "/api/offerwalls",
  "/api/ads/config",
  "/sitemap.xml",
  "/robots.txt",
]

let base
try {
  base = new URL(BASE)
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error("base URL must be HTTP(S) without credentials, query, or fragment")
  }
} catch (error) {
  console.error(`Invalid SMOKE_BASE_URL: ${error instanceof Error ? error.message : "invalid URL"}`)
  process.exit(2)
}

let failed = 0
console.log(`Anonymous smoke test: ${base.origin}\n${"─".repeat(60)}`)
for (const path of PATHS) {
  try {
    const response = await fetch(new URL(path, base), {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    })
    const pass = response.status >= 200 && response.status < 400
    if (!pass) failed++
    console.log(`${pass ? "PASS" : "FAIL"} ${response.status} ${path}`)
    await response.body?.cancel()
  } catch {
    failed++
    console.log(`FAIL ERR  ${path} — request failed or timed out`)
  }
}
console.log("─".repeat(60))
console.log(failed === 0 ? `ALL PASS (${PATHS.length} routes)` : `${failed} FAILED (${PATHS.length} routes)`)
process.exitCode = failed === 0 ? 0 : 1

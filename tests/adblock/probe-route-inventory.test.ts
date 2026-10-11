import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every /api URL the LIVE adblock code paths reference must exist as a
 * route handler — a missing route 404s, and the detection loop counts a 404
 * as "blocked", poisoning detection with a false signal on EVERY visitor.
 *
 * The BAIT_PATTERNS/ALL_BAIT_URLS block inside the hook is dead DATA
 * (declared, never fetched) — URLs that only appear inside it are excluded
 * so we don't force the creation of 63 routes the code never calls.
 */
const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

const LIVE_SOURCES = [
  "lib/hooks/use-adblock-detection.tsx",
  "lib/adblock/invisible-probes.ts",
  "lib/adblock/rotating-routes.ts",
]

function urlsInLiveCode(src: string): string[] {
  const lines = src.split("\n")
  const start = lines.findIndex((l) => l.includes("const BAIT_PATTERNS"))
  const end = lines.findIndex((l) => l.includes("const ALL_BAIT_URLS"))
  const live =
    start === -1 || end === -1 || end < start
      ? src
      : lines.slice(0, start).join("\n") + "\n" + lines.slice(end + 45).join("\n")
  return Array.from(live.matchAll(/"\/api\/[a-z0-9._/-]+"/g)).map((m) =>
    m[0].slice(1, -1),
  )
}

describe("adblock probe inventory", () => {
  it("dynamic rotating-route catch-alls exist", () => {
    expect(
      existsSync(resolve(process.cwd(), "app/api/t/[category]/[hash]/route.ts")),
    ).toBe(true)
    expect(
      existsSync(resolve(process.cwd(), "app/api/p/[...path]/route.ts")),
    ).toBe(true)
  })

  it("every /api URL referenced by live detection code has a route handler", () => {
    const refs = new Set<string>()
    for (const f of LIVE_SOURCES) {
      for (const u of urlsInLiveCode(read(f))) refs.add(u)
    }
    const missing: string[] = []
    for (const url of refs) {
      // Dynamic rotating-route namespaces + templated URLs are covered by
      // the catch-all test above.
      if (url.startsWith("/api/t/") || url.startsWith("/api/p/") || url.includes("{")) continue
      const rel = resolve(process.cwd(), "app", url)
      if (!existsSync(resolve(rel, "route.ts")) && !existsSync(rel)) missing.push(url)
    }
    expect(missing, `missing route handlers: ${missing.join(", ")}`).toEqual([])
  })
})

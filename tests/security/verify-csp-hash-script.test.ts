import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const ROOT = process.cwd()
const SCRIPT = resolve(ROOT, "scripts/verify-csp-hash.mjs")

// Any inline script carrying the next-themes bootstrap signature markers.
// Its hash will intentionally NOT match the pinned production bootstrap —
// these fixtures prove *discovery and classification*, not hash equality.
const BOOTSTRAP = `!function(){try{var d=document.documentElement,c=d.classList;c.remove('light','dark');var e=localStorage.getItem('theme');var t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}}()`

const OTHER_BOOTSTRAP = `try{if(localStorage.getItem('theme')){document.documentElement.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}}catch(e){}`

function makeFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(resolve(tmpdir(), "csp-hash-"))
  for (const [path, content] of Object.entries(files)) {
    const full = resolve(dir, path)
    mkdirSync(resolve(full, ".."), { recursive: true })
    writeFileSync(full, content)
  }
  return dir
}

function runScript(cwd: string) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" })
}

const fixtures: string[] = []
afterEach(() => {
  while (fixtures.length) rmSync(fixtures.pop()!, { recursive: true, force: true })
})

describe("verify-csp-hash build script", () => {
  it("discovers a bootstrap at any nested built path (no hardcoded about.html)", () => {
    // Regression: on Vercel the build output has no .next/server/app/about.html
    // and the script crashed with ENOENT, failing the whole deployment.
    const dir = makeFixture({
      ".next/server/app/(public)/faq.html": `<html><body><script>${BOOTSTRAP}</script></body></html>`,
    })
    fixtures.push(dir)
    const result = runScript(dir)
    const out = `${result.stdout}${result.stderr}`
    expect(result.status).not.toBe(0)
    expect(out).toContain("does not allow") // found + classified, then hash-checked
    expect(out).not.toContain("ENOENT")
    expect(out).not.toContain("found none")
  })

  it("reports every unmatched bootstrap across multiple built pages", () => {
    const dir = makeFixture({
      ".next/server/app/about.html": `<script>${BOOTSTRAP}</script>`,
      ".next/server/app/(public)/faq.html": `<script>${OTHER_BOOTSTRAP}</script>`,
    })
    fixtures.push(dir)
    const result = runScript(dir)
    const out = `${result.stdout}${result.stderr}`
    expect(result.status).not.toBe(0)
    expect(out).toContain("does not allow")
    expect(out).toContain("about.html")
    expect(out).toContain("faq.html")
  })

  it("passes with a warning when the build output has no HTML to verify", () => {
    const dir = makeFixture({ ".next/server/app/favicon.ico": "not-html" })
    fixtures.push(dir)
    const result = runScript(dir)
    const out = `${result.stdout}${result.stderr}`
    expect(result.status).toBe(0)
    expect(out).toContain("no built HTML pages found")
  })

  it("fails when HTML exists but no script matches the bootstrap signature", () => {
    const dir = makeFixture({
      ".next/server/app/about.html": `<html><body><script>console.log("no theme markers here")</script></body></html>`,
    })
    fixtures.push(dir)
    const result = runScript(dir)
    const out = `${result.stdout}${result.stderr}`
    expect(result.status).not.toBe(0)
    expect(out).toContain("found none")
  })

  it("accepts the real built bootstrap when build output is present (integration)", { timeout: 60_000 }, () => {
    const appDir = resolve(ROOT, ".next/server/app")
    const hasHtml = existsSync(appDir) && readdirSync(appDir).includes("about.html")
    if (!hasHtml) return // no build output in this environment; discovery covered above
    const result = runScript(ROOT)
    const out = `${result.stdout}${result.stderr}`
    expect(result.status).toBe(0)
    expect(out).toContain("Verified strict CSP hash")
    expect(out).toContain("'sha256-zjP2BXYgSCCnXNMXI2IL1yRydoQdsGR/uCCr6kyKsD0='")
  })
})

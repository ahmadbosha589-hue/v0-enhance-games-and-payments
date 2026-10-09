import { spawnSync } from "node:child_process"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "CRON_SECRET",
  "ENCRYPTION_KEY",
  "SUPABASE_JWT_SECRET",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "NEXT_PUBLIC_ADSGRAM_BLOCK_ID",
]

function runLaunchGate(ci: boolean) {
  const env = { ...process.env }
  for (const name of REQUIRED_ENV) delete env[name]
  env.CRON_SECRET = "launch-gate-test-sentinel-not-a-secret"
  return spawnSync(process.execPath, ["scripts/verify-launch.mjs", ...(ci ? ["--ci"] : [])], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  })
}

function walkSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name)
    const stat = statSync(path)
    if (stat.isDirectory()) return walkSourceFiles(path)
    return /\.(?:ts|tsx|js|mjs)$/.test(name) ? [path] : []
  })
}

describe("launch verification gate", () => {
  it("CI mode warns on missing operator values but still passes code checks", () => {
    const result = runLaunchGate(true)
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    expect(result.status).toBe(0)
    expect(output).toContain("WARN  env NEXT_PUBLIC_SUPABASE_URL")
    expect(output).toContain("code checks passed")
    expect(output).not.toContain("launch-gate-test-sentinel-not-a-secret")
  })

  it("production mode fails closed and never prints environment values", () => {
    const result = runLaunchGate(false)
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    expect(result.status).not.toBe(0)
    expect(output).toContain("FAIL  env NEXT_PUBLIC_SUPABASE_URL")
    expect(output).toContain("FAIL  env NEXT_PUBLIC_ADSGRAM_BLOCK_ID")
    expect(output).not.toContain("launch-gate-test-sentinel-not-a-secret")
  })

  it("pins ENCRYPTION_KEY as required (ad-network config crypto has no fallback)", () => {
    const script = readFileSync(resolve(ROOT, "scripts/verify-launch.mjs"), "utf8")
    const requiredBlock = script.slice(script.indexOf("const requiredEnvironment"), script.indexOf("for (const name of requiredEnvironment)"))
    expect(requiredBlock).toContain('"ENCRYPTION_KEY"')
    const crypto = readFileSync(resolve(ROOT, "lib/ads/network-config-crypto.ts"), "utf8")
    expect(crypto).toContain('throw new Error("ENCRYPTION_KEY is required')

    const result = runLaunchGate(false)
    expect(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).toContain("FAIL  env ENCRYPTION_KEY")
  })

  it("documents every statically referenced environment variable", () => {
    const roots = ["app", "components", "hooks", "lib", "scripts"]
    const sources = roots.flatMap((directory) => {
      const path = resolve(ROOT, directory)
      try {
        return walkSourceFiles(path)
      } catch {
        return []
      }
    })
    const used = new Set<string>()
    for (const path of sources) {
      const text = readFileSync(path, "utf8")
      for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) used.add(match[1])
    }

    const example = readFileSync(resolve(ROOT, ".env.example"), "utf8")
    const documented = new Set(
      [...example.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)].map((match) => match[1]),
    )
    const missing = [...used].filter((name) => !documented.has(name)).sort()
    expect(missing).toEqual([])
  })
})

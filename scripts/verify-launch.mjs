#!/usr/bin/env node
// Static launch gate. Never prints environment values; --ci downgrades missing
// operator configuration to warnings but code/documentation checks still fail.
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CI_MODE = process.argv.includes("--ci")
const results = []

function readRepoFile(path) {
  const fullPath = resolve(ROOT, path)
  return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : ""
}

function walkSourceFiles(directory) {
  const fullPath = resolve(ROOT, directory)
  if (!existsSync(fullPath)) return []
  return readdirSync(fullPath, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(fullPath, entry.name)
    if (entry.isDirectory()) return walkSourceFiles(path)
    return /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [path] : []
  })
}

function recordCode(pass, name, detail = "") {
  results.push({ kind: "code", pass, name, detail })
}

function recordEnvironment(name, configured, detail = "") {
  results.push({ kind: "environment", pass: configured, name, detail })
}

const sourceFiles = ["app", "components", "hooks", "lib", "scripts"].flatMap(walkSourceFiles)
const referencedEnvironment = new Set()
for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8")
  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    referencedEnvironment.add(match[1])
  }
}

const envExample = readRepoFile(".env.example")
const documentedEnvironment = new Set(
  [...envExample.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)].map((match) => match[1]),
)
if (!envExample) {
  recordCode(false, ".env.example exists")
} else {
  const undocumented = [...referencedEnvironment].filter((name) => !documentedEnvironment.has(name)).sort()
  recordCode(
    undocumented.length === 0,
    ".env.example documents all static environment references",
    undocumented.length ? `missing: ${undocumented.join(", ")}` : `${referencedEnvironment.size} names covered`,
  )
}

const offerwallConfig = readRepoFile("lib/config/offerwall-providers.ts")
const supportedPostbackSecrets = [...new Set(
  [...offerwallConfig.matchAll(/secretEnv\s*:\s*"([A-Z][A-Z0-9_]*)"/g)].map((match) => match[1]),
)]
recordCode(
  supportedPostbackSecrets.length > 0,
  "supported offerwall postback-secret registry is readable",
  supportedPostbackSecrets.length ? `${supportedPostbackSecrets.length} supported providers` : "no supported secret entries found",
)

const requiredEnvironment = [...new Set([
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
  ...supportedPostbackSecrets,
])]
for (const name of requiredEnvironment) {
  const value = process.env[name]?.trim() ?? ""
  const looksLikePlaceholder = /^(?:your|replace|change|example|placeholder|xxx|<)/i.test(value)
  recordEnvironment(name, value.length > 0 && !looksLikePlaceholder, "required for the configured production feature set")
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? ""
if (appUrl) {
  let canonical = false
  try {
    const parsed = new URL(appUrl)
    canonical = parsed.origin === "https://www.faucero.com" && parsed.pathname === "/" && !parsed.search && !parsed.hash
  } catch {
    canonical = false
  }
  recordEnvironment("NEXT_PUBLIC_APP_URL canonical", canonical, "must be https://www.faucero.com with no path, query, or fragment")
}

const nextConfig = readRepoFile("next.config.mjs")
const cspEnforced = /key:\s*["']Content-Security-Policy["']/.test(nextConfig)
const cspReportOnly = /key:\s*["']Content-Security-Policy-Report-Only["']/.test(nextConfig)
recordCode(cspEnforced && !cspReportOnly, "CSP is enforcing in next.config.mjs")

const failedCode = results.filter((result) => result.kind === "code" && !result.pass)
const missingEnvironment = results.filter((result) => result.kind === "environment" && !result.pass)

console.log(`\nFaucero launch verification${CI_MODE ? " (CI mode)" : ""}\n${"─".repeat(68)}`)
for (const result of results) {
  const isWarning = result.kind === "environment" && !result.pass && CI_MODE
  const isFailure = result.kind === "code" ? !result.pass : !result.pass && !CI_MODE
  const status = result.pass ? "PASS" : isWarning ? "WARN" : isFailure ? "FAIL" : "WARN"
  console.log(`${status}  ${result.kind === "code" ? "code" : "env"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`)
}
if (failedCode.length === 0) console.log("PASS  code checks passed")
console.log("─".repeat(68))
if (failedCode.length > 0) {
  console.log(`${failedCode.length} code check(s) failed`)
  process.exitCode = 1
} else if (missingEnvironment.length > 0 && !CI_MODE) {
  console.log(`${missingEnvironment.length} required environment value(s) missing or placeholder; launch is not ready`)
  process.exitCode = 1
} else if (missingEnvironment.length > 0) {
  console.log(`${missingEnvironment.length} operator value(s) missing; CI warnings do not imply production readiness`)
  process.exitCode = 0
} else {
  console.log("ALL PASS — required launch configuration is present")
  process.exitCode = 0
}

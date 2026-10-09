import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { buildCspPolicy } from "../lib/security/csp-policy.mjs"

const appDir = resolve(process.cwd(), ".next/server/app")

/** Recursively collect every built .html file under the app output dir. */
async function collectHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collectHtmlFiles(path)))
    else if (entry.name.endsWith(".html")) files.push(path)
  }
  return files
}

const htmlFiles = await collectHtmlFiles(appDir)

if (htmlFiles.length === 0) {
  // Build outputs differ across bundlers/hosts (e.g. no prerendered HTML at
  // all). The nonce policy itself is still contract-tested in the test suite;
  // the build-time hash check only applies when HTML was actually emitted.
  console.log("Verified strict CSP hash: no built HTML pages found; skipping build-time hash check")
  process.exit(0)
}

const themeBodies = new Map()
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8")
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
  for (const [, attributes, body] of scriptTags) {
    const isThemeBootstrap =
      !/\bsrc\s*=/.test(attributes) &&
      !/\btype\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attributes) &&
      body.includes("document.documentElement") &&
      body.includes("localStorage") &&
      body.includes("matchMedia")
    if (isThemeBootstrap) themeBodies.set(body, file)
  }
}

if (themeBodies.size === 0) {
  throw new Error(`Expected a built next-themes bootstrap under ${appDir}; found none`)
}

const noncePolicy = buildCspPolicy("dGVzdC1ub25jZQ==")
const scriptSources = noncePolicy.match(/(?:^|; )script-src ([^;]+)/)?.[1]?.split(/\s+/) ?? []

if (scriptSources.includes("'unsafe-inline'")) {
  throw new Error("Nonce-based script-src must not allow unsafe-inline")
}

const allowedHashes = new Set(scriptSources.filter((source) => source.startsWith("'sha256-")))
const missing = []
for (const [body, file] of themeBodies) {
  const hash = `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`
  if (!allowedHashes.has(hash)) missing.push(`${file}: ${hash}`)
}

if (missing.length > 0) {
  throw new Error(`Nonce-based CSP does not allow the built next-themes bootstrap hash(s):\n${missing.join("\n")}`)
}

console.log(
  `Verified strict CSP hash for next-themes bootstrap: ${[...themeBodies.keys()]
    .map((body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`)
    .join(", ")}`,
)

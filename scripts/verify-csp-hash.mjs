import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { buildCspPolicy } from "../lib/security/csp-policy.mjs"

const builtPage = resolve(process.cwd(), ".next/server/app/about.html")
const html = await readFile(builtPage, "utf8")
const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
const themeScripts = scriptTags.filter(([, attributes, body]) => {
  return (
    !/\bsrc\s*=/.test(attributes) &&
    !/\btype\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attributes) &&
    body.includes("document.documentElement") &&
    body.includes("localStorage") &&
    body.includes("matchMedia")
  )
})

if (themeScripts.length !== 1) {
  throw new Error(`Expected one built next-themes bootstrap in ${builtPage}; found ${themeScripts.length}`)
}

const themeScript = themeScripts[0][2]
const hash = `'sha256-${createHash("sha256").update(themeScript, "utf8").digest("base64")}'`
const noncePolicy = buildCspPolicy("dGVzdC1ub25jZQ==")
const scriptSources = noncePolicy.match(/(?:^|; )script-src ([^;]+)/)?.[1]?.split(/\s+/) ?? []

if (scriptSources.includes("'unsafe-inline'")) {
  throw new Error("Nonce-based script-src must not allow unsafe-inline")
}
if (!scriptSources.includes(hash)) {
  throw new Error(`Nonce-based CSP does not allow the built next-themes bootstrap hash ${hash}`)
}

console.log(`Verified strict CSP hash for next-themes bootstrap: ${hash}`)

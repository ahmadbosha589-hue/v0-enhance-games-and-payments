// Convert unguarded `createAdminClient()` calls to the throwing
// `requireAdminClient()` accessor.
//
// `createAdminClient()` returns null when SUPABASE_SERVICE_ROLE_KEY is absent —
// a deliberate fail-closed decision (S20) so a missing env var can never
// silently downgrade to the anon key and make an admin look like a non-admin.
// Its contract is "callers handle null", but 29 call sites across 12 files never
// did, producing 68 TS18047 errors and, at runtime, an opaque
// `Cannot read properties of null` instead of a diagnosable failure.
//
// `requireAdminClient()` (lib/supabase/admin-client.ts) wraps it and throws
// ServiceUnavailableError with an actionable message. Every call site here is
// function-scoped (verified: no module-level construction), so the throw lands
// inside a request handler and surfaces as a handled 500 rather than a crash at
// import time. Call sites that DO guard on null are left alone — their soft path
// stays intact.
const fs = require("node:fs")

const FILES = [
  "app/auth/callback/route.ts",
  "lib/security/server-validation.ts",
  "lib/security/server-fortress.ts",
  "app/dashboard/achievements/page.tsx",
  "app/api/admin/ad-networks/route.ts",
  "app/dashboard/earn/page.tsx",
  "app/api/admin/shortlinks/route.ts",
  "app/api/achievements/claim/route.ts",
  "app/api/admin/faucetpay/route.ts",
  "app/api/admin/adblock-stats/route.ts",
  "app/dashboard/ptc/page.tsx",
  "lib/security/vpn-fortress.ts",
]

let totalCalls = 0
const report = []

for (const file of FILES) {
  if (!fs.existsSync(file)) {
    report.push(`${file}: MISSING`)
    continue
  }

  let src = fs.readFileSync(file, "utf8")
  const original = src

  // How many call sites are we about to rewrite?
  const callCount = (src.match(/createAdminClient\(\)/g) || []).length
  if (callCount === 0) {
    report.push(`${file}: no createAdminClient() calls`)
    continue
  }

  // Skip a call site that is immediately null-guarded — that caller opted into
  // the soft path deliberately and we must not convert it to a throw.
  // Detect `const X = createAdminClient()` followed within 3 lines by `if (!X)`.
  const lines = src.split("\n")
  const guarded = new Set()
  lines.forEach((line, i) => {
    const m = line.match(/const\s+(\w+)\s*=\s*createAdminClient\(\)/)
    if (!m) return
    const varName = m[1]
    for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
      if (new RegExp(`if\\s*\\(\\s*!${varName}\\b`).test(lines[j])) {
        guarded.add(i)
        return
      }
    }
  })

  let converted = 0
  const out = lines.map((line, i) => {
    if (guarded.has(i)) return line
    if (!/createAdminClient\(\)/.test(line)) return line
    converted++
    return line.replace(/createAdminClient\(\)/g, "requireAdminClient()")
  })
  src = out.join("\n")

  if (converted === 0) {
    report.push(`${file}: all ${callCount} call(s) already guarded — left as-is`)
    continue
  }

  // Ensure requireAdminClient is imported. Prefer extending an existing
  // admin-client import; otherwise add a fresh one after the last import.
  if (!/\brequireAdminClient\b\s*[,}]/.test(src) && !/import\s+\{[^}]*requireAdminClient/.test(src)) {
    const adminClientImport = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/supabase\/admin-client["']/)
    if (adminClientImport) {
      const names = adminClientImport[1]
      src = src.replace(
        adminClientImport[0],
        adminClientImport[0].replace(names, `${names.trimEnd().replace(/,$/, "")}, requireAdminClient `),
      )
    } else {
      // Insert after the final top-level import statement.
      const importRe = /^import\s.*?(?:from\s*["'][^"']+["'])\s*;?\s*$/gm
      let last = null
      for (const m of src.matchAll(importRe)) last = m
      if (last) {
        const at = last.index + last[0].length
        src = `${src.slice(0, at)}\nimport { requireAdminClient } from "@/lib/supabase/admin-client"${src.slice(at)}`
      } else {
        src = `import { requireAdminClient } from "@/lib/supabase/admin-client"\n${src}`
      }
    }
  }

  // Drop a now-unused createAdminClient from its import list, but only if no
  // reference survives anywhere in the file.
  if (!/createAdminClient\(\)/.test(src)) {
    src = src.replace(/(import\s*\{)([^}]*)(\}\s*from\s*["']@\/lib\/supabase\/server["'])/, (full, open, names, close) => {
      const kept = names
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== "createAdminClient")
      if (kept.length === 0) return "" // whole import becomes dead
      return `${open} ${kept.join(", ")} ${close}`
    })
    // Clean up a blank line left by a removed import.
    src = src.replace(/^\n{3,}/gm, "\n\n")
  }

  if (src !== original) {
    fs.writeFileSync(file, src)
    totalCalls += converted
    report.push(`${file}: ${converted}/${callCount} call(s) -> requireAdminClient()`)
  }
}

console.log(report.join("\n"))
console.log(`\nTOTAL CALL SITES CONVERTED: ${totalCalls}`)

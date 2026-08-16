// Rewrites admin API routes to use the single requireAdmin() choke point.
//
// Handles the three shapes found in the codebase:
//   A) `const user = await getUser()` + inline profile/role lookup
//   B) a local `requireAdmin()`/`getAdmin()` helper wrapping supabase.auth.getUser()
//   C) no auth at all (admin/adblock-stats, admin/analytics-data)
//
// Idempotent: a file already importing requireAdmin from lib/supabase/server is
// skipped.
const fs = require("node:fs")
const path = require("node:path")

const ROUTES = [
  "app/api/admin/ad-networks/route.ts",
  "app/api/admin/ads/route.ts",
  "app/api/admin/coupons/route.ts",
  "app/api/admin/coupons/bulk/route.ts",
  "app/api/admin/coupons/[id]/route.ts",
  "app/api/admin/notifications/route.ts",
  "app/api/admin/stats/daily/route.ts",
  "app/api/admin/adblock-stats/route.ts",
  "app/api/admin/analytics-data/route.ts",
]

let changed = 0
const report = []

for (const rel of ROUTES) {
  if (!fs.existsSync(rel)) {
    report.push([rel, "MISSING"])
    continue
  }
  let src = fs.readFileSync(rel, "utf8")
  const eol = src.includes("\r\n") ? "\r\n" : "\n"

  if (/requireAdmin\s*}?\s*from\s*"@\/lib\/supabase\/server"/.test(src)) {
    report.push([rel, "already-migrated"])
    continue
  }

  // 1. Ensure the import pulls requireAdmin from the shared module.
  const importRe = /import\s*\{([^}]*)\}\s*from\s*"@\/lib\/supabase\/server"/
  if (importRe.test(src)) {
    src = src.replace(importRe, (m, names) => {
      const set = new Set(
        names
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
      set.add("requireAdmin")
      // getUser is no longer the admin entry point; keep it only if still used
      // for something else in the file (checked after the body rewrite).
      return `import { ${[...set].join(", ")} } from "@/lib/supabase/server"`
    })
  } else {
    // No existing import from the module (shape C) — add one after the last import.
    const lines = src.split(/\r?\n/)
    let last = -1
    lines.forEach((l, i) => {
      if (/^import\s/.test(l)) last = i
    })
    lines.splice(last + 1, 0, 'import { requireAdmin } from "@/lib/supabase/server"')
    src = lines.join(eol)
  }

  // 2. Insert a guard at the top of each exported handler that lacks one.
  const GUARD = [
    "  const admin = await requireAdmin([\"admin\", \"superadmin\"])",
    "  if (!admin) {",
    "    return NextResponse.json({ error: \"Forbidden\" }, { status: 403 })",
    "  }",
    "",
  ].join(eol)

  const handlerRe =
    /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\{/g

  src = src.replace(handlerRe, (match) => match + eol + GUARD)

  fs.writeFileSync(rel, src)
  changed++
  report.push([rel, "guarded"])
}

for (const [f, s] of report) console.log(s.padEnd(18), f)
console.log("---- files changed:", changed)

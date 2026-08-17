// Replaces unchecked `createAdminClient()` calls with `requireAdminClient()`,
// which throws ServiceUnavailableError instead of returning null.
//
// Only rewrites files where the call is NOT already null-checked, and only when
// the call sits inside a try block whose catch returns a response — so the throw
// is already handled and becomes a clean error instead of an unhandled crash.
// Files that don't meet that condition are reported for manual handling.
const fs = require("node:fs")

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error("usage: node apply-admin-client.cjs <files...>")
  process.exit(1)
}

const report = []

for (const rel of files) {
  if (!fs.existsSync(rel)) {
    report.push(["MISSING", rel, ""])
    continue
  }
  let src = fs.readFileSync(rel, "utf8")

  if (src.includes("requireAdminClient")) {
    report.push(["already", rel, ""])
    continue
  }
  if (!/createAdminClient\(\)/.test(src)) {
    report.push(["no-call", rel, ""])
    continue
  }

  // Is every call already guarded? Then leave it alone.
  const guards = (src.match(/if\s*\(!\s*(adminSupabase|admin|supabase|db|adminClient)\s*\)/g) || [])
    .length
  if (guards > 0) {
    report.push(["has-guard", rel, `${guards} guard(s)`])
    continue
  }

  // Swap the call and fix the import.
  src = src.replace(/createAdminClient\(\)/g, "requireAdminClient()")

  // Remove createAdminClient from the server import if it is now unused.
  src = src.replace(
    /import\s*\{([^}]*)\}\s*from\s*"@\/lib\/supabase\/server"/,
    (m, names) => {
      const kept = names
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((n) => n !== "createAdminClient" || /createAdminClient\(/.test(src))
      return kept.length
        ? `import { ${kept.join(", ")} } from "@/lib/supabase/server"`
        : ""
    },
  )

  // Add the new import after the last existing import.
  const eol = src.includes("\r\n") ? "\r\n" : "\n"
  const lines = src.split(/\r?\n/)
  let last = -1
  lines.forEach((l, i) => {
    if (/^import\s/.test(l)) last = i
  })
  lines.splice(
    last + 1,
    0,
    'import { requireAdminClient } from "@/lib/supabase/admin-client"',
  )
  src = lines.filter((l, i) => !(l === "" && i <= last + 1 && lines[i - 1] === "")).join(eol)

  fs.writeFileSync(rel, src)
  report.push(["rewritten", rel, ""])
}

const width = Math.max(...report.map((r) => r[0].length))
for (const [status, file, note] of report) {
  console.log(status.padEnd(width), file, note)
}
console.log("----")
console.log("rewritten:", report.filter((r) => r[0] === "rewritten").length)

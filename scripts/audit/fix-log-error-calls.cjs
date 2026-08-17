// Normalizes log.error(...) calls that pass a context object where the logger
// expects a positional Error.
//
// lib/logger.ts signature is:  error(message, error?: Error, context?: LogContext)
// Calls written as             error(message, { error: "..." })
// type-fail and, worse, silently drop the message into the Error slot.
const fs = require("node:fs")

const files = process.argv.slice(2)
let touched = 0

for (const rel of files) {
  if (!fs.existsSync(rel)) {
    console.log("MISSING", rel)
    continue
  }
  const before = fs.readFileSync(rel, "utf8")

  // log.error("msg", { error: <expr> })                -> log.error("msg", toError(<expr>))
  // log.error("msg", { error: <expr>, ...rest })       -> log.error("msg", toError(<expr>), { ...rest })
  let after = before.replace(
    /log\.error\(\s*("(?:[^"\\]|\\.)*")\s*,\s*\{\s*error:\s*([^,}]+?)\s*\}\s*\)/gs,
    (_m, msg, expr) => `log.error(${msg}, toError(${expr.trim()}))`,
  )
  after = after.replace(
    /log\.error\(\s*("(?:[^"\\]|\\.)*")\s*,\s*\{\s*error:\s*([^,}]+?)\s*,\s*([\s\S]*?)\}\s*\)/gs,
    (_m, msg, expr, rest) =>
      `log.error(${msg}, toError(${expr.trim()}), { ${rest.trim().replace(/,\s*$/, "")} })`,
  )

  if (after === before) {
    console.log("no-change", rel)
    continue
  }

  // Ensure the toError helper is imported.
  if (!/from "@\/lib\/logger"/.test(after)) {
    console.log("WARN no logger import:", rel)
  } else if (!/\btoError\b/.test(after.split("\n").filter((l) => /^import/.test(l)).join("\n"))) {
    after = after.replace(
      /import\s*\{([^}]*)\}\s*from\s*"@\/lib\/logger"/,
      (m, names) => {
        const set = new Set(
          names
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        )
        set.add("toError")
        return `import { ${[...set].join(", ")} } from "@/lib/logger"`
      },
    )
  }

  fs.writeFileSync(rel, after)
  touched++
  console.log("fixed", rel)
}

console.log("---- touched:", touched)

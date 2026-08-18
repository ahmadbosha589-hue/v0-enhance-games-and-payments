// T5: replace the /api/auth/me polling ladder with one bounded confirmation.
//
// The old shape (twice in this file — handleLogin and completeLoginAfter2FA):
//   for (let attempt = 0; attempt < 3; attempt++) {
//     fetch("/api/auth/me", { signal: AbortSignal.timeout(3000) })
//     ... await sleep(300)
//   }
//   if (!serverSeesSession) { setError("Signed in, but ...") ; return }
//
// = up to 9.9s of dead time on every SUCCESSFUL sign-in, and a hard failure
// (staying on the login page) if the probe never confirmed.
const fs = require("node:fs")

const FILE = "app/auth/login/page.tsx"
let src = fs.readFileSync(FILE, "utf8")
const eol = src.includes("\r\n") ? "\r\n" : "\n"

if (src.includes("T5: single bounded confirmation")) {
  console.log("SKIP: already applied")
  process.exit(0)
}

// Match the whole poll block through the failure branch, non-greedily.
const pollRe =
  /[ \t]*let serverSeesSession = false\r?\n[\s\S]*?if \(!serverSeesSession\) \{\r?\n[\s\S]*?\r?\n[ \t]*\}\r?\n/g

const replacement = [
  "      // T5: single bounded confirmation instead of a 3x(3000+300)ms ladder.",
  "      //",
  "      // The Supabase browser client has already written the session cookie by",
  "      // the time signInWithPassword() resolves, and the proxy routes on cookie",
  "      // PRESENCE (lib/supabase/proxy.ts) rather than a live getUser() call — so",
  "      // the /dashboard -> /auth/login -> /dashboard bounce this loop guarded",
  "      // against can no longer happen. One short probe is enough.",
  "      let serverSeesSession = false",
  "      try {",
  '        const res = await fetch("/api/auth/me", {',
  '          credentials: "include",',
  '          cache: "no-store",',
  "          signal: AbortSignal.timeout(1200),",
  "        })",
  "        if (res.ok) {",
  "          const data = await res.json()",
  "          serverSeesSession = !!data?.user",
  "        }",
  "      } catch {",
  "        // Timed out or offline — fall through and redirect anyway (below).",
  "      }",
  "",
  "      // Redirect REGARDLESS of the probe result. The dashboard layout runs its",
  "      // own resilient getUser() and the proxy has a loop-breaker (?expired=1)",
  "      // for a genuinely dead session, so stranding the user on the login page",
  "      // after a successful credential check was strictly worse than letting the",
  "      // dashboard resolve it. ?warm=1 marks the unconfirmed case for debugging.",
  "",
].join(eol)

const matches = src.match(pollRe)
if (!matches) {
  console.error("FAIL: poll block not found")
  process.exit(1)
}

src = src.replace(pollRe, replacement)

// Now make the redirect unconditional in both places.
src = src.replace(
  /redirectingRef\.current = true\r?\n([ \t]*)toast\.success\("Welcome back!"\)\r?\n[ \t]*window\.location\.replace\(safeRedirect\)/g,
  (_m, indent) =>
    [
      "redirectingRef.current = true",
      `${indent}toast.success("Welcome back!")`,
      `${indent}window.location.replace(`,
      `${indent}  serverSeesSession ? safeRedirect : \`\${safeRedirect}\${safeRedirect.includes("?") ? "&" : "?"}warm=1\``,
      `${indent})`,
    ].join(eol),
)

fs.writeFileSync(FILE, src)
console.log("OK: replaced", matches.length, "poll block(s)")

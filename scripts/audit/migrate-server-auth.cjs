// Replaces the unsigned-JWT decoder block in lib/supabase/server.ts
// (decodeJwtPayload + readAuthCookiePayload) with a signature-verified
// implementation. Idempotent: refuses to run twice.
const fs = require("node:fs")

const FILE = "lib/supabase/server.ts"
const src = fs.readFileSync(FILE, "utf8")
const lines = src.split(/\r?\n/)

if (src.includes("readVerifiedCookieUser")) {
  console.log("SKIP: already migrated")
  process.exit(0)
}

const startIdx = lines.findIndex((l) => l.startsWith("function decodeJwtPayload("))
const endMarker = lines.findIndex(
  (l, i) => i > startIdx && l.trimEnd() === "}" && lines[i - 1].trim() === "return null",
)
if (startIdx < 0 || endMarker < 0) {
  console.error("FAIL: could not locate the decoder block", { startIdx, endMarker })
  process.exit(1)
}

const replacement = `/**
 * Reassemble the (possibly chunked) Supabase auth cookie and return the raw
 * access_token string.
 *
 * @supabase/ssr stores the session as either a single \`sb-{ref}-auth-token\`
 * cookie or chunked \`sb-{ref}-auth-token.0\`, \`.1\`, … when the payload exceeds
 * one cookie. The reassembled value may be prefixed with \`base64-\` and contain
 * base64-encoded JSON, raw JSON, or (older sessions) a bare JWT.
 *
 * NOTE: this function deliberately returns ONLY the token. The cookie's
 * plaintext \`user\` object is attacker-controlled — even on an otherwise-valid
 * session — so it must never be used as an identity source. Identity comes from
 * the verified token claims alone.
 */
async function readAccessTokenFromCookies(): Promise<string | null> {
  let cookieStore
  try {
    cookieStore = await cookies()
  } catch {
    return null
  }

  const authCookies = cookieStore
    .getAll()
    .filter(
      (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token") && !!c.value,
    )
  if (authCookies.length === 0) return null

  // Group by base name (strip a trailing ".0" / ".1" / …) then concatenate in
  // index order.
  const groups = new Map<string, { idx: number; value: string }[]>()
  for (const c of authCookies) {
    const match = c.name.match(/^(.*?)(?:\\.(\\d+))?$/)
    const base = match?.[1] ?? c.name
    const idx = match?.[2] ? Number(match[2]) : 0
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base)!.push({ idx, value: c.value })
  }

  for (const chunks of groups.values()) {
    chunks.sort((a, b) => a.idx - b.idx)
    let raw = chunks.map((c) => c.value).join("")

    if (raw.startsWith("base64-")) {
      raw = base64UrlDecode(raw.slice("base64-".length))
      if (!raw) continue
    }

    try {
      const parsed = JSON.parse(raw)
      const token = parsed?.access_token ?? parsed?.currentSession?.access_token
      if (typeof token === "string" && token.split(".").length === 3) return token
    } catch {
      // Not JSON — some older sessions store the bare JWT.
      if (raw.split(".").length === 3) return raw
    }
  }

  return null
}

/**
 * Resolve the current user from the session cookie with NO network call, using
 * a cryptographically verified access token.
 *
 * Returns null unless the token's signature, issuer and expiry all check out
 * (see lib/supabase/jwt-verify.ts). The returned user carries
 * \`__from_cookie: true\` so privileged paths can require a live re-verification
 * — an offline-valid token remains valid until \`exp\` even if the session was
 * revoked (logout-everywhere, ban, password reset), which read paths tolerate
 * but admin/money writes must not.
 */
async function readVerifiedCookieUser(): Promise<{ user: CookieUser } | null> {
  const token = await readAccessTokenFromCookies()
  if (!token) return null

  // Cheap pre-check so an expired token skips signature work entirely. Never
  // used as identity on its own.
  if (isTokenExpired(token)) return null

  const claims = await verifyAccessToken(token)
  if (!claims?.sub) return null

  return {
    user: {
      id: String(claims.sub),
      email: typeof claims.email === "string" ? claims.email : null,
      user_metadata: claims.user_metadata,
      app_metadata: claims.app_metadata,
      aud: typeof claims.aud === "string" ? claims.aud : undefined,
      role: typeof claims.role === "string" ? claims.role : undefined,
      __from_cookie: true,
    },
  }
}`

const out = [
  ...lines.slice(0, startIdx),
  replacement,
  ...lines.slice(endMarker + 1),
].join("\n")

// Swap all call sites and add the import.
let final = out.replace(/readAuthCookiePayload\(\)/g, "readVerifiedCookieUser()")
final = final.replace(
  'import { cache } from "react"',
  'import { cache } from "react"\nimport { verifyAccessToken, isTokenExpired } from "./jwt-verify"',
)
final = final.replace(
  '"[Supabase Server] Falling back to cookie-decoded user — Supabase Auth API unreachable",',
  '"[Supabase Server] Using offline VERIFIED token identity — Supabase Auth API unreachable",',
)

fs.writeFileSync(FILE, final)
console.log("OK: replaced lines", startIdx + 1, "-", endMarker + 1)
console.log("call sites rewritten:", (out.match(/readAuthCookiePayload\(\)/g) || []).length)

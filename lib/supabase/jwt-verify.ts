import { createRemoteJWKSet, jwtVerify, decodeJwt, type JWTPayload } from "jose"

/**
 * Supabase access-token verification.
 *
 * WHY THIS EXISTS (RC-1)
 * ---------------------
 * lib/supabase/server.ts needs an offline way to resolve the current user so a
 * slow or unreachable Supabase Auth API cannot bounce a logged-in user out of
 * the dashboard. The previous implementation achieved that by base64-decoding
 * the session cookie and trusting the `user` object inside it, with no
 * signature check at all. Because admin role lookups run through the
 * service-role client (RLS bypassed) and admin UUIDs are publicly discoverable
 * via /api/leaderboard, any anonymous visitor could mint an admin session by
 * setting a single cookie.
 *
 * Verifying a JWT is a purely local operation once the signing key is known, so
 * we keep 100% of the availability benefit and lose none of the security. Only
 * the *trust* model changes.
 *
 * Supabase signs access tokens either with:
 *   - the legacy shared HS256 secret (`SUPABASE_JWT_SECRET`), or
 *   - asymmetric keys (ES256/RS256) published at
 *     `<project>/auth/v1/.well-known/jwks.json` (current projects, and the
 *     target state after Supabase's JWT signing-key migration).
 *
 * Both are supported. If neither is configured we fail CLOSED (return null)
 * rather than falling back to trusting unverified claims.
 */

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || ""

/** Algorithms we accept. `none` is impossible here by construction. */
const SYMMETRIC_ALGS = ["HS256"] as const
const ASYMMETRIC_ALGS = ["RS256", "ES256"] as const

/**
 * Cached across invocations on a warm serverless instance. `jose` handles key
 * rotation, its own caching and a cooldown internally, so this results in at
 * most one JWKS fetch per cold start rather than one per request.
 */
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks() {
  if (!SUPABASE_URL) return null
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(
      new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
      {
        // Do not hammer the JWKS endpoint when an unknown `kid` appears.
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
        // This runs on the request path; a hung key fetch must not hang the page.
        timeoutDuration: 2_000,
      },
    )
  }
  return jwksCache
}

/** Test seam: drop the cached JWKS (used by the suite, harmless in production). */
export function resetJwksCache(): void {
  jwksCache = null
}

export interface VerifiedClaims extends JWTPayload {
  sub: string
  email?: string
  role?: string
  session_id?: string
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
}

function readAlg(token: string): string | null {
  const dot = token.indexOf(".")
  if (dot <= 0) return null
  try {
    const header = JSON.parse(
      Buffer.from(token.slice(0, dot), "base64url").toString("utf8"),
    )
    return typeof header?.alg === "string" ? header.alg : null
  } catch {
    return null
  }
}

/**
 * Verify an access token's SIGNATURE, issuer and expiry.
 *
 * Returns null on ANY failure: malformed token, unsupported/`none` algorithm,
 * bad signature, expired, wrong issuer, missing `sub`, or no verification
 * material configured. It never returns claims it could not cryptographically
 * verify.
 */
export async function verifyAccessToken(
  token: string,
): Promise<VerifiedClaims | null> {
  if (!token || token.split(".").length !== 3) return null

  const alg = readAlg(token)
  // An explicit allow-list is what makes `alg: "none"` (and algorithm-confusion
  // attacks generally) impossible: jose is told which algorithms are acceptable
  // and rejects anything else, so a token cannot nominate its own verification.
  if (!alg || alg === "none") return null

  // `issuer` is only enforced when we know our own project URL. Supabase issues
  // `<url>/auth/v1`.
  const issuer = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1` : undefined

  try {
    if ((SYMMETRIC_ALGS as readonly string[]).includes(alg)) {
      if (!JWT_SECRET) return null
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(JWT_SECRET),
        { algorithms: [...SYMMETRIC_ALGS], issuer, clockTolerance: 10 },
      )
      return typeof payload.sub === "string" && payload.sub
        ? (payload as VerifiedClaims)
        : null
    }

    if ((ASYMMETRIC_ALGS as readonly string[]).includes(alg)) {
      const keySet = getJwks()
      if (!keySet) return null
      const { payload } = await jwtVerify(token, keySet, {
        algorithms: [...ASYMMETRIC_ALGS],
        issuer,
        clockTolerance: 10,
      })
      return typeof payload.sub === "string" && payload.sub
        ? (payload as VerifiedClaims)
        : null
    }

    // Unsupported algorithm — fail closed.
    return null
  } catch {
    // Signature/expiry/issuer failure, or the JWKS fetch timed out. Either way
    // we have no verified identity.
    return null
  }
}

/**
 * Expiry-only pre-check with NO signature verification.
 *
 * Use ONLY to skip pointless verification work on an already-expired token.
 * Its result must never be treated as identity or as proof of anything else —
 * the payload it reads is attacker-controlled until `verifyAccessToken()` has
 * succeeded.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const { exp } = decodeJwt(token)
    return typeof exp === "number" ? exp * 1000 <= Date.now() : true
  } catch {
    return true
  }
}

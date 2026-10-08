"use client"

import { useCallback, useEffect, useRef } from "react"

/**
 * Client-side CSRF helper (double-submit pattern).
 *
 * The `__csrf` cookie is httpOnly (JS cannot read it), so the token value is
 * fetched from GET /api/csrf and held in module scope. Mutating requests must
 * include it as the `x-csrf-token` header; the server verifies
 * header === cookie AND HMAC signature AND 1h TTL (verifyCSRFFromRequest).
 *
 * Usage:
 *   const { csrfHeaders, refreshCsrf } = useCsrf()
 *   await fetch("/api/withdraw", { method: "POST", headers: csrfHeaders(), ... })
 *
 * On a 403 "CSRF" response the token likely expired (1h TTL) — call
 * refreshCsrf() and retry once.
 */

let cachedToken: string | null = null
let fetchPromise: Promise<string | null> | null = null

async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/csrf", { method: "GET", credentials: "include" })
    if (!res.ok) return null
    const json = await res.json()
    cachedToken = typeof json?.token === "string" ? json.token : null
    return cachedToken
  } catch {
    return null
  }
}

export function useCsrf() {
  const tokenRef = useRef<string | null>(cachedToken)

  const refreshCsrf = useCallback(async (): Promise<string | null> => {
    if (!fetchPromise) {
      fetchPromise = fetchToken().finally(() => {
        fetchPromise = null
      })
    }
    const token = await fetchPromise
    tokenRef.current = token
    return token
  }, [])

  // Fetch once on mount when we have no token yet.
  useEffect(() => {
    if (!tokenRef.current && !fetchPromise) {
      void refreshCsrf()
    }
  }, [refreshCsrf])

  const csrfHeaders = useCallback(async (): Promise<Record<string, string>> => {
    let token = tokenRef.current
    if (!token) token = await refreshCsrf()
    return token ? { "x-csrf-token": token } : {}
  }, [refreshCsrf])

  return { csrfHeaders, refreshCsrf }
}

/**
 * Shortlink Provider Integration
 *
 * Supported providers (configure via env vars):
 *  - Shrinkme:  SHRINKME_API_KEY   → https://shrinkme.io
 *  - exe.io:    EXEIO_API_KEY      → https://exe.io
 *  - fc.lc:     FCLC_API_KEY       → https://fc.lc
 *  - gplinks:   GPLINKS_API_KEY    → https://gplinks.in
 *  - ouo.io:    OUOIO_API_KEY      → https://ouo.io
 *
 * Set SHORTLINK_PROVIDER to one of: shrinkme | exeio | fclc | gplinks | ouoio
 * Default: shrinkme
 */

export interface ShortenResult {
  success: boolean
  shortenedUrl?: string
  error?: string
}

const TIMEOUT_MS = 8000

async function fetchWithTimeout(url: string, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(tid)
    return res
  } catch (err) {
    clearTimeout(tid)
    throw err
  }
}

// ─── Shrinkme ─────────────────────────────────────────────────────────────────
async function shortenShrinkme(url: string, apiKey: string): Promise<ShortenResult> {
  try {
    const endpoint = `https://shrinkme.io/api?api=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(url)}`
    const res = await fetchWithTimeout(endpoint)
    const data = await res.json()
    if (data.status === "success" && data.shortenedUrl) {
      return { success: true, shortenedUrl: data.shortenedUrl }
    }
    return { success: false, error: data.message || "Shrinkme: unknown error" }
  } catch (err) {
    return { success: false, error: `Shrinkme request failed: ${err instanceof Error ? err.message : "network error"}` }
  }
}

// ─── exe.io ───────────────────────────────────────────────────────────────────
async function shortenExeio(url: string, apiKey: string): Promise<ShortenResult> {
  try {
    const endpoint = `https://exe.io/api?api=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(url)}`
    const res = await fetchWithTimeout(endpoint)
    const data = await res.json()
    if (data.status === "success" && data.shortenedUrl) {
      return { success: true, shortenedUrl: data.shortenedUrl }
    }
    return { success: false, error: data.message || "exe.io: unknown error" }
  } catch (err) {
    return { success: false, error: `exe.io request failed: ${err instanceof Error ? err.message : "network error"}` }
  }
}

// ─── fc.lc ────────────────────────────────────────────────────────────────────
async function shortenFclc(url: string, apiKey: string): Promise<ShortenResult> {
  try {
    const endpoint = `https://fc.lc/api?api=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(url)}`
    const res = await fetchWithTimeout(endpoint)
    const data = await res.json()
    if (data.status === "success" && data.shortenedUrl) {
      return { success: true, shortenedUrl: data.shortenedUrl }
    }
    return { success: false, error: data.message || "fc.lc: unknown error" }
  } catch (err) {
    return { success: false, error: `fc.lc request failed: ${err instanceof Error ? err.message : "network error"}` }
  }
}

// ─── gplinks ──────────────────────────────────────────────────────────────────
async function shortenGplinks(url: string, apiKey: string): Promise<ShortenResult> {
  try {
    const endpoint = `https://gplinks.in/api?api=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(url)}`
    const res = await fetchWithTimeout(endpoint)
    const data = await res.json()
    if (data.status === "success" && data.shortenedUrl) {
      return { success: true, shortenedUrl: data.shortenedUrl }
    }
    return { success: false, error: data.message || "gplinks: unknown error" }
  } catch (err) {
    return { success: false, error: `gplinks request failed: ${err instanceof Error ? err.message : "network error"}` }
  }
}

// ─── ouo.io ───────────────────────────────────────────────────────────────────
async function shortenOuoio(url: string, apiKey: string): Promise<ShortenResult> {
  try {
    const endpoint = `https://ouo.io/api/${encodeURIComponent(apiKey)}?s=${encodeURIComponent(url)}`
    const res = await fetchWithTimeout(endpoint)
    if (res.ok) {
      const shortenedUrl = await res.text()
      if (shortenedUrl.startsWith("http")) {
        return { success: true, shortenedUrl: shortenedUrl.trim() }
      }
    }
    return { success: false, error: "ouo.io: could not shorten URL" }
  } catch (err) {
    return { success: false, error: `ouo.io request failed: ${err instanceof Error ? err.message : "network error"}` }
  }
}

// ─── Main exported function ───────────────────────────────────────────────────

export async function shortenUrl(destinationUrl: string): Promise<ShortenResult> {
  const provider = (process.env.SHORTLINK_PROVIDER || "shrinkme").toLowerCase()

  const providerMap: Record<string, { key: string | undefined; fn: (u: string, k: string) => Promise<ShortenResult> }> = {
    shrinkme: { key: process.env.SHRINKME_API_KEY, fn: shortenShrinkme },
    exeio: { key: process.env.EXEIO_API_KEY, fn: shortenExeio },
    fclc: { key: process.env.FCLC_API_KEY, fn: shortenFclc },
    gplinks: { key: process.env.GPLINKS_API_KEY, fn: shortenGplinks },
    ouoio: { key: process.env.OUOIO_API_KEY, fn: shortenOuoio },
  }

  const selected = providerMap[provider]
  if (!selected) {
    return { success: false, error: `Unknown shortlink provider: ${provider}. Valid options: ${Object.keys(providerMap).join(", ")}` }
  }

  if (!selected.key) {
    return {
      success: false,
      error: `Shortlink provider "${provider}" is configured but the API key env var is not set. ` +
        `Set ${provider.toUpperCase().replace(".", "_")}_API_KEY (e.g. SHRINKME_API_KEY).`,
    }
  }

  return selected.fn(destinationUrl, selected.key)
}

export function isShortlinkConfigured(): boolean {
  const provider = (process.env.SHORTLINK_PROVIDER || "shrinkme").toLowerCase()
  const keyMap: Record<string, string | undefined> = {
    shrinkme: process.env.SHRINKME_API_KEY,
    exeio: process.env.EXEIO_API_KEY,
    fclc: process.env.FCLC_API_KEY,
    gplinks: process.env.GPLINKS_API_KEY,
    ouoio: process.env.OUOIO_API_KEY,
  }
  return !!keyMap[provider]
}

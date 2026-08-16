/**
 * Shortlink Provider Integration
 *
 * Supported providers (configure via env vars):
 *  - Shrinkme:    SHRINKME_API_KEY    → https://shrinkme.io
 *  - ShrinkEarn:  SHRINKEARN_API_KEY  → https://shrinkearn.com
 *  - exe.io:      EXEIO_API_KEY       → https://exe.io
 *  - fc.lc:       FCLC_API_KEY        → https://fc.lc
 *  - gplinks:     GPLINKS_API_KEY     → https://gplinks.in
 *  - ouo.io:      OUOIO_API_KEY       → https://ouo.io
 *  - Linkvertise: LINKVERTISE_API_KEY → https://linkvertise.com
 *  - Shorte.st:   SHORTEST_API_KEY    → https://shorte.st
 *  - ShareUs:     SHAREUS_API_KEY     → https://shareus.io
 *  - Stfly:       STFLY_API_KEY       → https://stfly.io
 *  - Cuty.io:     CUTY_API_KEY        → https://cuty.io
 *  - AdFoc.us:    ADFOCUS_API_KEY     → https://adfoc.us
 *  - LinkPays:    LINKPAYS_API_KEY    → https://linkpays.in
 *  - Clk.sh:      CLK_API_KEY         → https://clk.sh
 *
 * Set SHORTLINK_PROVIDER to one of:
 *  shrinkme | shrinkearn | exeio | fclc | gplinks | ouoio | linkvertise
 *  | shortest | shareus | stfly | cuty | adfocus | linkpays | clk
 *
 * Default: shrinkme
 */

export interface ShortenResult {
  success: boolean
  shortenedUrl?: string
  error?: string
}

const TIMEOUT_MS = 8000

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = TIMEOUT_MS
): Promise<Response> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...(init || {}), signal: ctrl.signal })
    clearTimeout(tid)
    return res
  } catch (err) {
    clearTimeout(tid)
    throw err
  }
}

// ─── Generic standard-API shortener (used by most providers below) ───────────
// Most modern shortlink providers expose the same simple API contract:
//   GET https://{domain}/api?api={KEY}&url={URL}
//   → { status: "success" | "error", shortenedUrl: "...", message: "..." }
// We use this helper to keep provider implementations DRY.
async function shortenViaStandardApi(
  providerName: string,
  baseUrl: string,
  apiKey: string,
  url: string
): Promise<ShortenResult> {
  try {
    const endpoint = `${baseUrl}/api?api=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(url)}`
    const res = await fetchWithTimeout(endpoint)
    const data = await res.json().catch(() => null)
    if (data && data.status === "success" && data.shortenedUrl) {
      return { success: true, shortenedUrl: data.shortenedUrl }
    }
    return {
      success: false,
      error: data?.message || `${providerName}: unknown error`,
    }
  } catch (err) {
    return {
      success: false,
      error: `${providerName} request failed: ${err instanceof Error ? err.message : "network error"}`,
    }
  }
}

// ─── Provider implementations ────────────────────────────────────────────────

const shortenShrinkme = (url: string, apiKey: string) =>
  shortenViaStandardApi("Shrinkme", "https://shrinkme.io", apiKey, url)

const shortenShrinkearn = (url: string, apiKey: string) =>
  shortenViaStandardApi("ShrinkEarn", "https://shrinkearn.com", apiKey, url)

const shortenExeio = (url: string, apiKey: string) =>
  shortenViaStandardApi("exe.io", "https://exe.io", apiKey, url)

const shortenFclc = (url: string, apiKey: string) =>
  shortenViaStandardApi("fc.lc", "https://fc.lc", apiKey, url)

const shortenGplinks = (url: string, apiKey: string) =>
  shortenViaStandardApi("gplinks", "https://gplinks.in", apiKey, url)

const shortenShareus = (url: string, apiKey: string) =>
  shortenViaStandardApi("ShareUs", "https://shareus.io", apiKey, url)

const shortenStfly = (url: string, apiKey: string) =>
  shortenViaStandardApi("Stfly", "https://stfly.io", apiKey, url)

const shortenCuty = (url: string, apiKey: string) =>
  shortenViaStandardApi("Cuty.io", "https://cuty.io", apiKey, url)

const shortenAdfocus = (url: string, apiKey: string) =>
  shortenViaStandardApi("AdFoc.us", "https://adfoc.us", apiKey, url)

const shortenLinkpays = (url: string, apiKey: string) =>
  shortenViaStandardApi("LinkPays", "https://linkpays.in", apiKey, url)

const shortenClk = (url: string, apiKey: string) =>
  shortenViaStandardApi("Clk.sh", "https://clk.sh", apiKey, url)

// ─── ouo.io (custom plaintext response) ──────────────────────────────────────
async function shortenOuoio(url: string, apiKey: string): Promise<ShortenResult> {
  try {
    const endpoint = `https://ouo.io/api/${encodeURIComponent(apiKey)}?s=${encodeURIComponent(url)}`
    const res = await fetchWithTimeout(endpoint)
    if (res.ok) {
      const shortenedUrl = (await res.text()).trim()
      if (shortenedUrl.startsWith("http")) {
        return { success: true, shortenedUrl }
      }
    }
    return { success: false, error: "ouo.io: could not shorten URL" }
  } catch (err) {
    return {
      success: false,
      error: `ouo.io request failed: ${err instanceof Error ? err.message : "network error"}`,
    }
  }
}

// ─── Linkvertise (token-based JSON API) ──────────────────────────────────────
async function shortenLinkvertise(url: string, apiKey: string): Promise<ShortenResult> {
  try {
    const endpoint = `https://publisher.linkvertise.com/api/v1/redirect/link/static`
    const res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url, title: "Shortlink", target_type: "link" }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.data?.url) {
      return { success: true, shortenedUrl: data.data.url }
    }
    return {
      success: false,
      error: data?.message || "Linkvertise: unknown error",
    }
  } catch (err) {
    return {
      success: false,
      error: `Linkvertise request failed: ${err instanceof Error ? err.message : "network error"}`,
    }
  }
}

// ─── Shorte.st (custom POST API) ─────────────────────────────────────────────
async function shortenShortest(url: string, apiKey: string): Promise<ShortenResult> {
  try {
    const endpoint = `https://api.shorte.st/v1/data/url`
    const res = await fetchWithTimeout(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "public-api-token": apiKey,
      },
      body: `urlToShorten=${encodeURIComponent(url)}`,
    })
    const data = await res.json().catch(() => null)
    if (data?.status === "ok" && data.shortenedUrl) {
      return { success: true, shortenedUrl: data.shortenedUrl }
    }
    return {
      success: false,
      error: data?.error || "Shorte.st: unknown error",
    }
  } catch (err) {
    return {
      success: false,
      error: `Shorte.st request failed: ${err instanceof Error ? err.message : "network error"}`,
    }
  }
}

// ─── Provider registry ───────────────────────────────────────────────────────
type ProviderFn = (u: string, k: string) => Promise<ShortenResult>

interface ProviderEntry {
  envVar: string
  fn: ProviderFn
}

const PROVIDER_REGISTRY: Record<string, ProviderEntry> = {
  shrinkme:    { envVar: "SHRINKME_API_KEY",    fn: shortenShrinkme    },
  shrinkearn:  { envVar: "SHRINKEARN_API_KEY",  fn: shortenShrinkearn  },
  exeio:       { envVar: "EXEIO_API_KEY",       fn: shortenExeio       },
  fclc:        { envVar: "FCLC_API_KEY",        fn: shortenFclc        },
  gplinks:     { envVar: "GPLINKS_API_KEY",     fn: shortenGplinks     },
  ouoio:       { envVar: "OUOIO_API_KEY",       fn: shortenOuoio       },
  linkvertise: { envVar: "LINKVERTISE_API_KEY", fn: shortenLinkvertise },
  shortest:    { envVar: "SHORTEST_API_KEY",    fn: shortenShortest    },
  shareus:     { envVar: "SHAREUS_API_KEY",     fn: shortenShareus     },
  stfly:       { envVar: "STFLY_API_KEY",       fn: shortenStfly       },
  cuty:        { envVar: "CUTY_API_KEY",        fn: shortenCuty        },
  adfocus:     { envVar: "ADFOCUS_API_KEY",     fn: shortenAdfocus     },
  linkpays:    { envVar: "LINKPAYS_API_KEY",    fn: shortenLinkpays    },
  clk:         { envVar: "CLK_API_KEY",         fn: shortenClk         },
}

export const SUPPORTED_SHORTLINK_PROVIDERS = Object.keys(PROVIDER_REGISTRY)
export const SHORTLINK_ENV_VARS = Object.values(PROVIDER_REGISTRY).map(p => p.envVar)

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Shorten a URL using the active provider (configured via SHORTLINK_PROVIDER).
 * Falls back through all configured providers automatically if the primary
 * one is misconfigured, so a single bad key never breaks the user flow.
 */
export async function shortenUrl(destinationUrl: string): Promise<ShortenResult> {
  const provider = (process.env.SHORTLINK_PROVIDER || "shrinkme").toLowerCase()
  const selected = PROVIDER_REGISTRY[provider]

  if (!selected) {
    return {
      success: false,
      error: `Unknown shortlink provider: ${provider}. Valid options: ${SUPPORTED_SHORTLINK_PROVIDERS.join(", ")}`,
    }
  }

  const key = process.env[selected.envVar]
  if (key && key.trim().length > 0) {
    return selected.fn(destinationUrl, key.trim())
  }

  // Fallback: try any other provider that has its key configured.
  for (const [name, entry] of Object.entries(PROVIDER_REGISTRY)) {
    if (name === provider) continue
    const fallbackKey = process.env[entry.envVar]
    if (fallbackKey && fallbackKey.trim().length > 0) {
      const result = await entry.fn(destinationUrl, fallbackKey.trim())
      if (result.success) return result
    }
  }

  return {
    success: false,
    error:
      `Shortlink provider "${provider}" is configured but the API key env var (${selected.envVar}) is not set, ` +
      `and no other provider keys are configured. Add at least one of: ${SHORTLINK_ENV_VARS.join(", ")}.`,
  }
}

/**
 * Returns true if at least one shortlink provider is configured with a key.
 */
export function isShortlinkConfigured(): boolean {
  return Object.values(PROVIDER_REGISTRY).some(
    p => !!process.env[p.envVar] && (process.env[p.envVar] as string).trim().length > 0
  )
}

/**
 * Lists which providers currently have an API key configured.
 * Useful for admin UI to show "X of Y providers configured".
 */
export function listConfiguredShortlinkProviders(): string[] {
  return Object.entries(PROVIDER_REGISTRY)
    .filter(([, entry]) => {
      const v = process.env[entry.envVar]
      return !!v && v.trim().length > 0
    })
    .map(([name]) => name)
}

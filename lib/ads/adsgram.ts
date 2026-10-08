// AdsGram (Telegram Mini App ads) integration types + loader.
//
// Docs: https://docs.adsgram.ai/publisher/api-reference
// Script: <script src="https://sad.adsgram.ai/js/sad.min.js"></script>
//
// NOTE: AdsGram requires the page to run as a Telegram Mini App (the site is
// opened inside Telegram via the bot). Outside Telegram the SDK still loads,
// but `show()` may fail — the UI must handle that honestly.

export interface ShowPromiseResult {
  error?: boolean
  done?: boolean
  state?: string
  description?: string
}

export interface AdController {
  show(): Promise<ShowPromiseResult>
  addEventListener(event: string, listener: () => void): void
  removeEventListener(event: string, listener: () => void): void
}

declare global {
  interface Window {
    Adsgram?: {
      init(params: {
        blockId: string
        debug?: boolean
        debugConsole?: boolean
        debugBannerType?: string
      }): AdController
    }
  }
}

const SCRIPT_SRC = "https://sad.adsgram.ai/js/sad.min.js"
let scriptLoaded = false

/** Loads the AdsGram SDK script exactly once (init is once per blockId). */
export function loadAdsgramScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve()
  if (typeof window === "undefined") return Promise.resolve()

  return new Promise((resolve, reject) => {
    // Already present (e.g. injected by _document or a previous load).
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      scriptLoaded = true
      resolve()
      return
    }

    const script = document.createElement("script")
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => {
      scriptLoaded = true
      resolve()
    }
    script.onerror = () => reject(new Error("Failed to load the AdsGram SDK"))
    document.head.appendChild(script)
  })
}

/**
 * Resolves the AdsGram block id. Env-first so the operator can rotate it
 * without a redeploy; falls back to the DB-stored value.
 */
export async function getAdsgramBlockId(): Promise<string> {
  const envBlockId = process.env.NEXT_PUBLIC_ADSGRAM_BLOCK_ID?.trim()
  if (envBlockId) return envBlockId

  try {
    const res = await fetch("/api/ads/adsgram-config")
    if (res.ok) {
      const data = await res.json()
      if (data?.blockId) return String(data.blockId)
    }
  } catch {
    /* fall through */
  }
  return ""
}
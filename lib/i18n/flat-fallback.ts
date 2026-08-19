import type { LanguageCode } from "./namespaces/types"

/**
 * Legacy dot-notation fallback table.
 *
 * Namespace translations are already code-split. This table exists only for
 * older call sites that have not migrated to a namespace, so it must not be a
 * static import in the client language provider.
 */
let table: Record<string, Record<string, string>> | null = null
let loading: Promise<void> | null = null

export function primeFlatFallback(): Promise<void> {
  if (table) return Promise.resolve()
  if (!loading) {
    loading = import("./translations").then((module) => {
      table = module.translations as unknown as Record<string, Record<string, string>>
    })
  }
  return loading
}

export function flatLookup(lang: LanguageCode, key: string): string | undefined {
  if (!table) {
    void primeFlatFallback()
    return undefined
  }
  return table[lang]?.[key] ?? table.en?.[key]
}

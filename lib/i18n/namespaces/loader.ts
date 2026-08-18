// =====================================================
// Namespace Lazy Loader - Dynamic Import with Caching
// =====================================================

import type { SupportedLocale, Namespace, TranslationCache } from "./types"

// In-memory cache for loaded translations
const translationCache: TranslationCache = new Map()

// Generate cache key
function getCacheKey(locale: SupportedLocale, namespace: Namespace): string {
  return `${locale}:${namespace}`
}

// Dynamic import function for namespaces
async function importNamespace(locale: SupportedLocale, namespace: Namespace): Promise<Record<string, unknown>> {
  try {
    const loadedModule = await import(`./${locale}/${namespace}`)
    return loadedModule.default || loadedModule[namespace] || loadedModule
  } catch {
    // Fallback to English if locale not found
    if (locale !== "en") {
      console.warn(`[i18n] Namespace ${namespace} not found for ${locale}, falling back to English`)
      return importNamespace("en", namespace)
    }
    console.error(`[i18n] Failed to load namespace ${namespace} for ${locale}`)
    return {}
  }
}

// Load a single namespace with caching
export async function loadNamespace(locale: SupportedLocale, namespace: Namespace): Promise<Record<string, unknown>> {
  const cacheKey = getCacheKey(locale, namespace)

  // Return cached if available
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!
  }

  // Load and cache
  const translations = await importNamespace(locale, namespace)
  translationCache.set(cacheKey, translations)

  return translations
}

// Load multiple namespaces at once
export async function loadNamespaces(
  locale: SupportedLocale,
  namespaces: Namespace[],
): Promise<Record<Namespace, Record<string, unknown>>> {
  const results = await Promise.all(
    namespaces.map(async (ns) => {
      const translations = await loadNamespace(locale, ns)
      return [ns, translations] as const
    }),
  )

  return Object.fromEntries(results) as Record<Namespace, Record<string, unknown>>
}

// Preload namespaces for faster access
export async function preloadNamespaces(locale: SupportedLocale, namespaces: Namespace[]): Promise<void> {
  await Promise.all(namespaces.map((ns) => loadNamespace(locale, ns)))
}

// Get cached translation for a specific locale and namespace
export function getCachedTranslation(locale: SupportedLocale, namespace: Namespace): Record<string, unknown> | null {
  const cacheKey = getCacheKey(locale, namespace)
  return translationCache.get(cacheKey) || null
}

// Clear cache (useful for language switching)
export function clearTranslationCache(): void {
  translationCache.clear()
}

// Clear cache for specific locale
export function clearLocaleCache(locale: SupportedLocale): void {
  for (const key of translationCache.keys()) {
    if (key.startsWith(`${locale}:`)) {
      translationCache.delete(key)
    }
  }
}

// Check if namespace is cached
export function isNamespaceCached(locale: SupportedLocale, namespace: Namespace): boolean {
  return translationCache.has(getCacheKey(locale, namespace))
}

// Get translation with nested key support
export function getNestedTranslation(translations: Record<string, unknown>, key: string): string {
  const keys = key.split(".")
  let result: unknown = translations

  for (const k of keys) {
    if (result && typeof result === "object" && k in result) {
      result = (result as Record<string, unknown>)[k]
    } else {
      return key // Return key if not found
    }
  }

  return typeof result === "string" ? result : key
}

// Interpolate variables in translation strings
export function interpolate(template: string, variables: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return String(variables[key] ?? `{{${key}}}`)
  })
}

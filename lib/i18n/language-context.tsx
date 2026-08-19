"use client"

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react"
import {
  languages,
  type LanguageCode,
  type Namespace,
  type TranslationRecord,
  DEFAULT_LOCALE,
} from "./namespaces/types"
import { loadNamespaces, preloadNamespaces, getCachedTranslation } from "./namespace-loader"
import { flatLookup, primeFlatFallback } from "./flat-fallback"

interface LanguageContextType {
  language: LanguageCode
  setLanguage: (lang: LanguageCode) => void
  t: (key: string, namespaceOrDefault?: Namespace | string, variables?: Record<string, string | number>) => string
  languages: typeof languages
  isRTL: boolean
  isLoading: boolean
  loadedNamespaces: Namespace[]
  loadNamespace: (namespace: Namespace | Namespace[]) => Promise<void>
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const STORAGE_KEY = "cryptofaucet-language"

// Get nested value from object using dot notation
function getNestedValue(obj: TranslationRecord, path: string): string | undefined {
  const keys = path.split(".")
  let current: unknown = obj

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }

  return typeof current === "string" ? current : undefined
}

// Interpolate variables in translation string
function interpolate(str: string, variables?: Record<string, string | number>): string {
  if (!variables) return str
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => String(variables[key] ?? `{{${key}}}`))
}

function updateDocumentDirection(lang: LanguageCode) {
  if (typeof document === "undefined") return
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"
  document.documentElement.lang = lang
}

const validNamespaces: Namespace[] = [
  "common",
  "nav",
  "hero",
  "features",
  "howItWorks",
  "stats",
  "faq",
  "cta",
  "footer",
  "auth",
  "claim",
  "wallet",
  "referral",
  "leaderboard",
  "admin",
  "settings",
  "about",
  "contact",
  "errors",
  "time",
  "adblock",
  "antibot",
  "blog",
  "dashboard",
  "legal",
  "notifications",
  "testimonials",
]

function isNamespace(value: string | undefined): value is Namespace {
  return typeof value === "string" && validNamespaces.includes(value as Namespace)
}

const DEFAULT_NAMESPACES: Namespace[] = [
  "common",
  "nav",
  "hero",
  "features",
  "howItWorks",
  "stats",
  "faq",
  "cta",
  "footer",
  "testimonials",
  "auth",
]

interface LanguageProviderProps {
  children: ReactNode
  initialNamespaces?: Namespace[]
  defaultLanguage?: LanguageCode
}

export function LanguageProvider({
  children,
  initialNamespaces = DEFAULT_NAMESPACES,
  defaultLanguage = DEFAULT_LOCALE,
}: LanguageProviderProps) {
  const [language, setLanguageState] = useState<LanguageCode>(defaultLanguage)
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [flatFallbackReady, setFlatFallbackReady] = useState(false)
  const [translations, setTranslations] = useState<Record<Namespace, TranslationRecord>>(
    {} as Record<Namespace, TranslationRecord>,
  )
  const [loadedNamespaces, setLoadedNamespaces] = useState<Namespace[]>([])

  const initialNamespacesRef = useRef(initialNamespaces)

  useEffect(() => {
    setMounted(true)

    // Only access localStorage/navigator on client
    if (typeof window === "undefined") return

    try {
      const saved = localStorage.getItem(STORAGE_KEY) as LanguageCode | null
      if (saved && languages.some((l) => l.code === saved)) {
        setLanguageState(saved)
        updateDocumentDirection(saved)
      } else {
        // Try browser language detection
        const browserLang = navigator.language.split("-")[0] as LanguageCode
        if (languages.some((l) => l.code === browserLang)) {
          setLanguageState(browserLang)
          updateDocumentDirection(browserLang)
        }
      }
    } catch {
      // localStorage not available (SSR or private browsing)
    }
  }, [])

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return

    let cancelled = false
    const prime = () => {
      void primeFlatFallback()
        .then(() => {
          if (!cancelled) setFlatFallbackReady(true)
        })
        .catch(() => {
          // Namespace translations remain the primary path if the legacy
          // fallback chunk cannot be loaded.
        })
    }

    if ("requestIdleCallback" in window) {
      const idleWindow = window as Window & {
        requestIdleCallback: (callback: () => void, options?: { timeout: number }) => number
        cancelIdleCallback: (id: number) => void
      }
      const idleId = idleWindow.requestIdleCallback(prime, { timeout: 4000 })
      return () => {
        cancelled = true
        idleWindow.cancelIdleCallback(idleId)
      }
    }

    const timer = setTimeout(prime, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mounted])

  useEffect(() => {
    if (!mounted) return

    let cancelled = false
    setIsLoading(true)

    const namespacesToLoad = initialNamespacesRef.current

    loadNamespaces(language, namespacesToLoad)
      .then((loaded) => {
        if (cancelled) return
        setTranslations((prev) => ({ ...prev, ...loaded }))
        setLoadedNamespaces((prev) => [...new Set([...prev, ...namespacesToLoad])])
        setIsLoading(false)
      })
      .catch((error) => {
        if (cancelled) return
        console.error("[i18n] Failed to load namespaces:", error)
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [language, mounted])

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // localStorage not available
    }
    updateDocumentDirection(lang)
  }, [])

  const loadNamespace = useCallback(
    async (namespace: Namespace | Namespace[]) => {
      const nsArray = Array.isArray(namespace) ? namespace : [namespace]
      const toLoad = nsArray.filter((ns) => !loadedNamespaces.includes(ns))

      if (toLoad.length === 0) return

      const loaded = await loadNamespaces(language, toLoad)
      setTranslations((prev) => ({ ...prev, ...loaded }))
      setLoadedNamespaces((prev) => [...new Set([...prev, ...toLoad])])
    },
    [language, loadedNamespaces],
  )

  const t = useCallback(
    (key: string, namespaceOrDefault?: Namespace | string, variables?: Record<string, string | number>): string => {
      const currentLang = mounted ? language : defaultLanguage

      // If second parameter is a string but NOT a namespace, treat it as a default value
      const isDefaultValue = typeof namespaceOrDefault === "string" && !isNamespace(namespaceOrDefault)
      const namespace = isDefaultValue ? undefined : (namespaceOrDefault as Namespace | undefined)
      const defaultValue = isDefaultValue ? namespaceOrDefault : undefined

      // Legacy flat keys are loaded lazily after first paint. Namespace files
      // remain the primary translation path and do not pull every locale into
      // the shared client chunk.
      const flatValue = flatLookup(currentLang, key)
      if (flatValue) {
        return interpolate(flatValue, variables)
      }

      const enFlatValue = flatFallbackReady ? flatLookup("en", key) : undefined
      if (enFlatValue) {
        return interpolate(enFlatValue, variables)
      }

      const keyParts = key.split(".")
      if (keyParts.length >= 2) {
        const potentialNamespace = keyParts[0] as Namespace
        const remainingKey = keyParts.slice(1).join(".")

        if (isNamespace(potentialNamespace) && translations[potentialNamespace]) {
          const value = getNestedValue(translations[potentialNamespace], remainingKey)
          if (value) return interpolate(value, variables)
        }

        // Try English fallback for parsed namespace
        if (isNamespace(potentialNamespace)) {
          const enNsTranslations = getCachedTranslation("en", potentialNamespace)
          if (enNsTranslations) {
            const value = getNestedValue(enNsTranslations, remainingKey)
            if (value) return interpolate(value, variables)
          }
        }
      }

      // STRATEGY 4: Try namespace-based translations (new system)
      if (namespace && translations[namespace]) {
        const value = getNestedValue(translations[namespace], key)
        if (value) return interpolate(value, variables)
      }

      // STRATEGY 5: Try all loaded namespaces
      for (const ns of loadedNamespaces) {
        if (translations[ns]) {
          const value = getNestedValue(translations[ns], key)
          if (value) return interpolate(value, variables)
        }
      }

      // STRATEGY 6: Check cache for English fallback namespace translations
      for (const ns of namespace ? [namespace] : loadedNamespaces) {
        const enTranslations = getCachedTranslation("en", ns)
        if (enTranslations) {
          const value = getNestedValue(enTranslations, key)
          if (value) return interpolate(value, variables)
        }
      }

      // STRATEGY 7: Return default value if provided
      if (defaultValue) return interpolate(defaultValue, variables)

      // STRATEGY 8: Return key as last resort
      return key
    },
    [translations, loadedNamespaces, language, mounted, defaultLanguage, flatFallbackReady],
  )

  const isRTL = useMemo(() => {
    // Always return false on SSR to prevent hydration mismatch
    if (!mounted) return false
    return language === "ar"
  }, [mounted, language])

  const value = useMemo<LanguageContextType>(
    () => ({
      // Always use defaultLanguage on SSR, actual language on client
      language: mounted ? language : defaultLanguage,
      setLanguage,
      t,
      languages,
      isRTL,
      isLoading: mounted ? isLoading : true,
      loadedNamespaces,
      loadNamespace,
    }),
    [mounted, language, defaultLanguage, setLanguage, t, isRTL, isLoading, loadedNamespaces, loadNamespace],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}

// Preload hook for route-based prefetching
export function usePreloadNamespaces() {
  const { language } = useLanguage()

  return useCallback(
    (namespaces: Namespace[]) => {
      preloadNamespaces(language, namespaces)
    },
    [language],
  )
}

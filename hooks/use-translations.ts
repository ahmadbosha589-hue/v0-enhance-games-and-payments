"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useLanguage } from "@/lib/i18n/language-context"
import { loadNamespaces, getCachedTranslation } from "@/lib/i18n/namespace-loader"
import type { Namespace, TranslationRecord } from "@/lib/i18n/namespaces/types"

interface UseTranslationsOptions {
  namespaces: Namespace[]
  fallbackToKey?: boolean
}

interface UseTranslationsReturn {
  t: (key: string, namespace?: Namespace, variables?: Record<string, string | number>) => string
  isLoading: boolean
  isReady: boolean
}

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

function interpolate(str: string, variables?: Record<string, string | number>): string {
  if (!variables) return str
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => String(variables[key] ?? `{{${key}}}`))
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

function isNamespace(value: string): value is Namespace {
  return validNamespaces.includes(value as Namespace)
}

export function useTranslations({ namespaces, fallbackToKey = true }: UseTranslationsOptions): UseTranslationsReturn {
  const { language } = useLanguage()
  const [translations, setTranslations] = useState<Record<Namespace, TranslationRecord>>(
    {} as Record<Namespace, TranslationRecord>,
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)

  const prevLangRef = useRef(language)

  const namespacesKey = useMemo(() => namespaces.join(","), [namespaces])

  // Load translations when language or namespaces change
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (prevLangRef.current !== language || !isReady) {
        setIsLoading(true)
      }
      prevLangRef.current = language

      // Check cache first
      const cached: Record<Namespace, TranslationRecord> = {} as Record<Namespace, TranslationRecord>
      const toLoad: Namespace[] = []

      for (const ns of namespaces) {
        const cachedNs = getCachedTranslation(language, ns)
        if (cachedNs) {
          cached[ns] = cachedNs
        } else {
          toLoad.push(ns)
        }
      }

      // Load missing namespaces
      if (toLoad.length > 0) {
        try {
          const loaded = await loadNamespaces(language, toLoad)
          if (!cancelled) {
            setTranslations({ ...cached, ...loaded })
          }
        } catch (error) {
          console.error("[i18n] Failed to load namespaces:", error)
          if (!cancelled) {
            setTranslations(cached)
          }
        }
      } else {
        if (!cancelled) {
          setTranslations(cached)
        }
      }

      if (!cancelled) {
        setIsLoading(false)
        setIsReady(true)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [language, namespacesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const t = useCallback(
    (key: string, namespace?: Namespace, variables?: Record<string, string | number>): string => {
      // Try specified namespace first
      if (namespace && translations[namespace]) {
        const value = getNestedValue(translations[namespace], key)
        if (value) return interpolate(value, variables)
      }

      const keyParts = key.split(".")
      if (keyParts.length >= 2) {
        const potentialNamespace = keyParts[0] as Namespace
        const remainingKey = keyParts.slice(1).join(".")

        if (isNamespace(potentialNamespace) && translations[potentialNamespace]) {
          const value = getNestedValue(translations[potentialNamespace], remainingKey)
          if (value) return interpolate(value, variables)
        }
      }

      // Try all loaded namespaces
      for (const ns of namespaces) {
        if (translations[ns]) {
          const value = getNestedValue(translations[ns], key)
          if (value) return interpolate(value, variables)
        }
      }

      // English fallback from cache
      if (language !== "en") {
        if (keyParts.length >= 2) {
          const potentialNamespace = keyParts[0] as Namespace
          const remainingKey = keyParts.slice(1).join(".")

          if (isNamespace(potentialNamespace)) {
            const enTranslations = getCachedTranslation("en", potentialNamespace)
            if (enTranslations) {
              const value = getNestedValue(enTranslations, remainingKey)
              if (value) return interpolate(value, variables)
            }
          }
        }

        for (const ns of namespace ? [namespace] : namespaces) {
          const enTranslations = getCachedTranslation("en", ns)
          if (enTranslations) {
            const value = getNestedValue(enTranslations, key)
            if (value) return interpolate(value, variables)
          }
        }
      }

      return fallbackToKey ? key : ""
    },
    [translations, namespaces, language, fallbackToKey],
  )

  return { t, isLoading, isReady }
}

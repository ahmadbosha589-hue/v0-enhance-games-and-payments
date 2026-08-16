"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useTranslations } from "@/hooks/use-translations"
import type { Namespace } from "@/lib/i18n/namespaces/types"

interface TranslationContextType {
  t: (key: string, namespace?: Namespace) => string
  isLoading: boolean
  isReady: boolean
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined)

interface TranslationProviderProps {
  children: ReactNode
  namespaces: Namespace[]
  fallback?: ReactNode
}

export function TranslationProvider({ children, namespaces, fallback }: TranslationProviderProps) {
  const { t, isLoading, isReady } = useTranslations({ namespaces })

  if (isLoading && !isReady && fallback) {
    return <>{fallback}</>
  }

  return <TranslationContext.Provider value={{ t, isLoading, isReady }}>{children}</TranslationContext.Provider>
}

export function usePageTranslations() {
  const context = useContext(TranslationContext)
  if (context === undefined) {
    throw new Error("usePageTranslations must be used within a TranslationProvider")
  }
  return context
}

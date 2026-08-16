"use client"

import { useEffect, useState, createContext, useContext, useCallback, type ReactNode } from "react"

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed"
    platform: string
  }>
  prompt(): Promise<void>
}

interface PWAContextType {
  isInstallable: boolean
  isInstalled: boolean
  isOnline: boolean
  installApp: () => Promise<void>
}

const PWAContext = createContext<PWAContextType>({
  isInstallable: false,
  isInstalled: false,
  isOnline: true,
  installApp: async () => {},
})

export function usePWA() {
  return useContext(PWAContext)
}

interface PWAProviderProps {
  children: ReactNode
}

export function PWAProvider({ children }: PWAProviderProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isOnline, setIsOnline] = useState(true)

  // Register service worker
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const hasServiceWorkerSupport = "serviceWorker" in navigator

    if (hasServiceWorkerSupport) {
      // Register SW with better error handling
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          // Check for updates periodically
          const intervalId = setInterval(
            () => {
              registration.update().catch(() => {
                // Silently ignore update errors
              })
            },
            60 * 60 * 1000,
          ) // Every hour

          return () => clearInterval(intervalId)
        })
        .catch(() => {
          // Silently ignore SW registration errors - PWA features will be disabled
        })
    }

    // Check if already installed
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) {
        setIsInstalled(true)
      }
    } catch {
      // Ignore matchMedia errors
    }

    // Listen for display mode changes
    let mediaQuery: MediaQueryList | null = null
    try {
      mediaQuery = window.matchMedia("(display-mode: standalone)")
      const handleDisplayModeChange = (e: MediaQueryListEvent) => {
        setIsInstalled(e.matches)
      }
      mediaQuery.addEventListener("change", handleDisplayModeChange)
    } catch {
      // Ignore matchMedia errors
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)

    // Listen for successful install
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setInstallPrompt(null)
    }
    window.addEventListener("appinstalled", handleAppInstalled)

    // Online/offline detection
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      if (mediaQuery) {
        try {
          mediaQuery.removeEventListener("change", () => {})
        } catch {
          // Ignore cleanup errors
        }
      }
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const installApp = useCallback(async () => {
    if (!installPrompt) return

    try {
      await installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice

      if (outcome === "accepted") {
        setIsInstalled(true)
      }
      setInstallPrompt(null)
    } catch {
      // Silently ignore install errors
      setInstallPrompt(null)
    }
  }, [installPrompt])

  return (
    <PWAContext.Provider
      value={{
        isInstallable: !!installPrompt && !isInstalled,
        isInstalled,
        isOnline,
        installApp,
      }}
    >
      {children}
    </PWAContext.Provider>
  )
}

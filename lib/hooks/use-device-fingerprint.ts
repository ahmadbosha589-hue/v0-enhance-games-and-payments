"use client"

import { useState, useEffect, useRef } from "react"
import { generateDeviceFingerprint, collectDeviceInfo } from "@/lib/security/client-fingerprint"

interface UseDeviceFingerprintReturn {
  fingerprint: string | null
  isLoading: boolean
  error: Error | null
}

/**
 * Hook that generates a hardware-derived device fingerprint on mount.
 *
 * The fingerprint is kept in React state (memory) only - it does NOT depend
 * on cookies, localStorage, or sessionStorage, so it persists even after the
 * user clears all browser data.
 */
export function useDeviceFingerprint(): UseDeviceFingerprintReturn {
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    generateDeviceFingerprint()
      .then((fp) => {
        setFingerprint(fp)
        setIsLoading(false)
      })
      .catch((err) => {
        console.error("Failed to generate device fingerprint:", err)
        setError(err instanceof Error ? err : new Error("Fingerprint generation failed"))
        setIsLoading(false)
      })
  }, [])

  return { fingerprint, isLoading, error }
}

export { collectDeviceInfo }

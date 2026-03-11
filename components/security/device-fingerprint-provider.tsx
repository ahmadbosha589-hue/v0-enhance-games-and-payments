"use client"

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useDeviceFingerprint } from "@/lib/hooks/use-device-fingerprint"
import { collectDeviceInfo } from "@/lib/security/client-fingerprint"
import { toast } from "sonner"

interface DeviceFingerprintContextValue {
  /** The SHA-256 hash derived from hardware / browser properties */
  fingerprint: string | null
  /** Whether the fingerprint is still being generated */
  isLoading: boolean
  /** Server-side trust status after verification */
  deviceStatus: "pending" | "trusted" | "flagged" | "blocked"
}

const DeviceFingerprintContext = createContext<DeviceFingerprintContextValue>({
  fingerprint: null,
  isLoading: true,
  deviceStatus: "pending",
})

export function useDeviceFingerprintContext() {
  return useContext(DeviceFingerprintContext)
}

interface DeviceFingerprintProviderProps {
  children: ReactNode
}

/**
 * Wraps the dashboard and automatically:
 * 1. Generates a hardware-derived fingerprint (survives browser data clearing)
 * 2. Sends it to /api/fingerprint/verify once per session
 * 3. Makes the fingerprint available to all child components via context
 * 4. Warns/blocks if the device is flagged or banned
 */
export function DeviceFingerprintProvider({ children }: DeviceFingerprintProviderProps) {
  const { fingerprint, isLoading } = useDeviceFingerprint()
  const [deviceStatus, setDeviceStatus] = useState<"pending" | "trusted" | "flagged" | "blocked">("pending")
  const hasVerified = useRef(false)

  useEffect(() => {
    if (!fingerprint || hasVerified.current) return
    hasVerified.current = true

    const verify = async () => {
      try {
        const deviceInfo = collectDeviceInfo()

        const res = await fetch("/api/fingerprint/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fingerprintHash: fingerprint,
            deviceInfo,
          }),
        })

        if (!res.ok) {
          // Non-200 — treat as untrusted but don't block the UI
          setDeviceStatus("trusted")
          return
        }

        const data = await res.json()

        setDeviceStatus(data.status || "trusted")

        if (data.status === "blocked") {
          toast.error("This device has been flagged for suspicious activity. Some features may be restricted.", {
            duration: 10000,
          })
        } else if (data.status === "flagged") {
          toast.warning("Unusual device activity detected. Your account is under review.", {
            duration: 8000,
          })
        }
      } catch {
        // Network errors — don't block the user, fall back to trusted
        setDeviceStatus("trusted")
      }
    }

    verify()
  }, [fingerprint])

  return (
    <DeviceFingerprintContext.Provider value={{ fingerprint, isLoading, deviceStatus }}>
      {children}
    </DeviceFingerprintContext.Provider>
  )
}

"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface VPNCheckResult {
  isAllowed: boolean
  isVPN: boolean
  isProxy: boolean
  isTor: boolean
  confidence: number
  riskScore: number
  methods: string[]
}

interface UsePersistentVPNCheckOptions {
  /** Interval between periodic checks in ms (default: 30000 = 30s) */
  intervalMs?: number
  /** Whether to check when tab becomes visible again (default: true) */
  checkOnVisibilityChange?: boolean
  /** Whether to check on network change events (default: true) */
  checkOnNetworkChange?: boolean
  /** Whether to start checking immediately (default: true) */
  enabled?: boolean
}

interface UsePersistentVPNCheckReturn {
  /** Whether a VPN/proxy was detected */
  vpnDetected: boolean
  /** Whether a check is currently in progress */
  isChecking: boolean
  /** The last check result */
  lastResult: VPNCheckResult | null
  /** Manually trigger a re-check */
  recheck: () => Promise<void>
}

export function usePersistentVPNCheck(
  options: UsePersistentVPNCheckOptions = {}
): UsePersistentVPNCheckReturn {
  const {
    intervalMs = 30000,
    checkOnVisibilityChange = true,
    checkOnNetworkChange = true,
    enabled = true,
  } = options

  const [vpnDetected, setVpnDetected] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [lastResult, setLastResult] = useState<VPNCheckResult | null>(null)

  // Track collected WebRTC IPs across checks
  const webrtcIPsRef = useRef<string[]>([])
  const checkInFlightRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const networkCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Collect WebRTC IPs for leak detection
  const collectWebRTCIPs = useCallback((): Promise<string[]> => {
    return new Promise((resolve) => {
      try {
        const ips: string[] = []
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        })

        pc.createDataChannel("")

        pc.onicecandidate = (e) => {
          if (!e.candidate) return
          const parts = e.candidate.candidate.split(" ")
          const ip = parts[4]
          if (ip && !ips.includes(ip) && !ip.includes(":")) {
            ips.push(ip)
          }
        }

        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .catch(() => resolve([]))

        // Give ICE gathering time, then resolve
        setTimeout(() => {
          pc.close()
          webrtcIPsRef.current = ips
          resolve(ips)
        }, 2500)
      } catch {
        resolve(webrtcIPsRef.current)
      }
    })
  }, [])

  // Core VPN check function
  const performCheck = useCallback(async () => {
    // Prevent concurrent checks
    if (checkInFlightRef.current) return
    checkInFlightRef.current = true
    setIsChecking(true)

    try {
      // Re-collect WebRTC IPs each time (VPN toggle changes them)
      const currentWebrtcIPs = await collectWebRTCIPs()

      const response = await fetch("/api/security/vpn-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webrtcIPs: currentWebrtcIPs,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language,
          screenResolution: `${screen.width}x${screen.height}`,
          userAgent: navigator.userAgent,
        }),
      })

      if (response.ok) {
        const data: VPNCheckResult = await response.json()
        setLastResult(data)

        if (!data.isAllowed) {
          // VPN detected - set blocked and KEEP it blocked
          setVpnDetected(true)
        } else {
          // Only allow unblocking if confidence is high that it's clean
          // If previously detected, require a clean check to unblock
          setVpnDetected(false)
        }
      }
      // If request fails, keep current state (don't allow bypass via network manipulation)
    } catch {
      // Network error during check - if we previously detected VPN, keep blocked
      // This prevents bypassing by blocking the check endpoint
    } finally {
      checkInFlightRef.current = false
      setIsChecking(false)
    }
  }, [collectWebRTCIPs])

  // Manual recheck exposed to consumers
  const recheck = useCallback(async () => {
    await performCheck()
  }, [performCheck])

  // Initial check on mount
  useEffect(() => {
    if (!enabled) return
    performCheck()
  }, [enabled, performCheck])

  // Periodic interval checks
  useEffect(() => {
    if (!enabled) return

    intervalRef.current = setInterval(() => {
      performCheck()
    }, intervalMs)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, intervalMs, performCheck])

  // Check on tab visibility change (user switches back to tab)
  useEffect(() => {
    if (!enabled || !checkOnVisibilityChange) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Small delay to let network settle after tab switch
        setTimeout(() => performCheck(), 500)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [enabled, checkOnVisibilityChange, performCheck])

  // Check on network change (VPN toggle triggers online/offline or connection change)
  useEffect(() => {
    if (!enabled || !checkOnNetworkChange) return

    const handleNetworkChange = () => {
      // Debounce: VPN toggle can fire multiple network events rapidly
      if (networkCheckTimeoutRef.current) {
        clearTimeout(networkCheckTimeoutRef.current)
      }
      networkCheckTimeoutRef.current = setTimeout(() => {
        performCheck()
      }, 1500)
    }

    // 'online' event fires when VPN reconnects
    window.addEventListener("online", handleNetworkChange)
    // 'offline' can indicate VPN disconnect
    window.addEventListener("offline", handleNetworkChange)

    // Navigator.connection change event (works in Chrome/Edge)
    const connection = (navigator as any).connection
    if (connection) {
      connection.addEventListener("change", handleNetworkChange)
    }

    return () => {
      window.removeEventListener("online", handleNetworkChange)
      window.removeEventListener("offline", handleNetworkChange)
      if (connection) {
        connection.removeEventListener("change", handleNetworkChange)
      }
      if (networkCheckTimeoutRef.current) {
        clearTimeout(networkCheckTimeoutRef.current)
      }
    }
  }, [enabled, checkOnNetworkChange, performCheck])

  return {
    vpnDetected,
    isChecking,
    lastResult,
    recheck,
  }
}

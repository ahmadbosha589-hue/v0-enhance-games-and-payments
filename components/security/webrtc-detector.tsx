"use client"

import { useEffect, useCallback } from "react"

interface WebRTCDetectorProps {
  onDetection: (ips: string[]) => void
  enabled?: boolean
}

export function WebRTCDetector({ onDetection, enabled = true }: WebRTCDetectorProps) {
  const detectWebRTCIPs = useCallback(async () => {
    if (!enabled) return

    const ips: string[] = []

    try {
      // Create RTCPeerConnection with STUN server
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      })

      // Create data channel to trigger ICE gathering
      pc.createDataChannel("")

      // Listen for ICE candidates
      pc.onicecandidate = (event) => {
        if (!event.candidate) return

        const candidate = event.candidate.candidate
        if (!candidate) return

        // Extract IP from candidate string
        const ipMatch = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/)
        if (ipMatch && !ips.includes(ipMatch[0])) {
          // Filter out local IPs
          const ip = ipMatch[0]
          if (
            !ip.startsWith("10.") &&
            !ip.startsWith("192.168.") &&
            !ip.startsWith("172.16.") &&
            !ip.startsWith("172.17.") &&
            !ip.startsWith("172.18.") &&
            !ip.startsWith("172.19.") &&
            !ip.startsWith("172.20.") &&
            !ip.startsWith("172.21.") &&
            !ip.startsWith("172.22.") &&
            !ip.startsWith("172.23.") &&
            !ip.startsWith("172.24.") &&
            !ip.startsWith("172.25.") &&
            !ip.startsWith("172.26.") &&
            !ip.startsWith("172.27.") &&
            !ip.startsWith("172.28.") &&
            !ip.startsWith("172.29.") &&
            !ip.startsWith("172.30.") &&
            !ip.startsWith("172.31.") &&
            ip !== "127.0.0.1" &&
            !ip.startsWith("169.254.")
          ) {
            ips.push(ip)
          }
        }
      }

      // Create and set local description
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Wait for ICE gathering to complete
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve()
        } else {
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === "complete") {
              resolve()
            }
          }
          // Timeout after 3 seconds
          setTimeout(resolve, 3000)
        }
      })

      pc.close()

      if (ips.length > 0) {
        onDetection(ips)
      }
    } catch {
      // WebRTC not supported or blocked
    }
  }, [enabled, onDetection])

  useEffect(() => {
    detectWebRTCIPs()
  }, [detectWebRTCIPs])

  return null // This component doesn't render anything
}

// Hook for easy usage
export function useWebRTCDetection() {
  const detect = useCallback(async (): Promise<string[]> => {
    return new Promise((resolve) => {
      const ips: string[] = []

      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        })

        pc.createDataChannel("")

        pc.onicecandidate = (event) => {
          if (!event.candidate) return
          const candidate = event.candidate.candidate
          if (!candidate) return

          const ipMatch = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/)
          if (ipMatch && !ips.includes(ipMatch[0])) {
            const ip = ipMatch[0]
            // Filter local IPs
            if (!ip.startsWith("10.") && !ip.startsWith("192.168.") && !ip.startsWith("172.") && ip !== "127.0.0.1") {
              ips.push(ip)
            }
          }
        }

        pc.createOffer().then((offer) => pc.setLocalDescription(offer))

        setTimeout(() => {
          pc.close()
          resolve(ips)
        }, 3000)
      } catch {
        resolve([])
      }
    })
  }, [])

  return { detect }
}

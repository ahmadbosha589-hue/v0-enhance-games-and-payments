"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// Sound configuration with Web Audio API generated tones
// No external MP3 files needed - all sounds are synthesized
interface SoundConfig {
  frequency: number
  duration: number
  type: OscillatorType
  volume: number
  attack?: number
  decay?: number
}

const SOUNDS: Record<string, SoundConfig> = {
  // Click sound - short, satisfying pop
  click: { frequency: 1200, duration: 0.05, type: "sine", volume: 0.15, attack: 0.005, decay: 0.04 },
  // Hover sound - subtle high tone
  hover: { frequency: 800, duration: 0.03, type: "sine", volume: 0.08, attack: 0.005, decay: 0.02 },
  // Success sound - ascending happy tone
  success: { frequency: 880, duration: 0.15, type: "sine", volume: 0.2, attack: 0.01, decay: 0.12 },
  // Error sound - descending warning tone
  error: { frequency: 220, duration: 0.2, type: "sawtooth", volume: 0.15, attack: 0.01, decay: 0.15 },
  // Notification sound - attention-getting chime
  notification: { frequency: 660, duration: 0.12, type: "sine", volume: 0.18, attack: 0.01, decay: 0.1 },
  // Claim sound - rewarding coin-like sound
  claim: { frequency: 1400, duration: 0.1, type: "sine", volume: 0.2, attack: 0.005, decay: 0.08 },
  // Toggle sound - switch click
  toggle: { frequency: 1000, duration: 0.04, type: "square", volume: 0.1, attack: 0.002, decay: 0.03 },
  // Open/expand sound - whoosh up
  open: { frequency: 400, duration: 0.08, type: "sine", volume: 0.12, attack: 0.01, decay: 0.06 },
  // Close/collapse sound - whoosh down
  close: { frequency: 600, duration: 0.06, type: "sine", volume: 0.1, attack: 0.005, decay: 0.05 },
}

// Storage key for sound preference
const SOUND_ENABLED_KEY = "satoshi-faucet-sounds-enabled"

export type SoundType = keyof typeof SOUNDS

export function useButtonSounds() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load preference from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(SOUND_ENABLED_KEY)
      if (stored !== null) {
        setSoundEnabled(stored === "true")
      }
      setIsInitialized(true)
    }
  }, [])

  // Initialize AudioContext on first user interaction
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current && typeof window !== "undefined") {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      } catch (err) {
        console.warn("[ButtonSounds] Failed to create AudioContext:", err)
      }
    }
    return audioContextRef.current
  }, [])

  // Play a sound effect
  const playSound = useCallback((type: SoundType) => {
    if (!soundEnabled) return

    const ctx = initAudioContext()
    if (!ctx) return

    // Resume context if suspended (browsers require user interaction)
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => { })
    }

    const config = SOUNDS[type]
    if (!config) return

    try {
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.type = config.type
      oscillator.frequency.setValueAtTime(config.frequency, ctx.currentTime)

      // Apply envelope
      const attack = config.attack || 0.01
      const decay = config.decay || config.duration * 0.8

      gainNode.gain.setValueAtTime(0, ctx.currentTime)
      gainNode.gain.linearRampToValueAtTime(config.volume, ctx.currentTime + attack)
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + attack + decay)

      // Special handling for success sound - add second note
      if (type === "success") {
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = "sine"
        osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.08) // Higher note
        gain2.gain.setValueAtTime(0, ctx.currentTime + 0.08)
        gain2.gain.linearRampToValueAtTime(config.volume * 0.8, ctx.currentTime + 0.09)
        gain2.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2)
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.start(ctx.currentTime + 0.08)
        osc2.stop(ctx.currentTime + 0.25)
      }

      // Special handling for claim sound - add sparkle effect
      if (type === "claim") {
        for (let i = 1; i <= 3; i++) {
          const sparkle = ctx.createOscillator()
          const sparkleGain = ctx.createGain()
          sparkle.type = "sine"
          sparkle.frequency.setValueAtTime(1400 + i * 200, ctx.currentTime + i * 0.04)
          sparkleGain.gain.setValueAtTime(0, ctx.currentTime + i * 0.04)
          sparkleGain.gain.linearRampToValueAtTime(config.volume * 0.6, ctx.currentTime + i * 0.04 + 0.01)
          sparkleGain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.04 + 0.08)
          sparkle.connect(sparkleGain)
          sparkleGain.connect(ctx.destination)
          sparkle.start(ctx.currentTime + i * 0.04)
          sparkle.stop(ctx.currentTime + i * 0.04 + 0.1)
        }
      }

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + config.duration + 0.1)
    } catch (err) {
      // Silently fail - sounds are enhancement, not critical
    }
  }, [soundEnabled, initAudioContext])

  // Toggle sound on/off
  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const newValue = !prev
      if (typeof window !== "undefined") {
        localStorage.setItem(SOUND_ENABLED_KEY, String(newValue))
      }
      return newValue
    })
  }, [])

  // Set sound preference
  const setSound = useCallback((enabled: boolean) => {
    setSoundEnabled(enabled)
    if (typeof window !== "undefined") {
      localStorage.setItem(SOUND_ENABLED_KEY, String(enabled))
    }
  }, [])

  return {
    playSound,
    soundEnabled,
    toggleSound,
    setSound,
    isInitialized,
    // Convenience methods
    playClick: useCallback(() => playSound("click"), [playSound]),
    playHover: useCallback(() => playSound("hover"), [playSound]),
    playSuccess: useCallback(() => playSound("success"), [playSound]),
    playError: useCallback(() => playSound("error"), [playSound]),
    playNotification: useCallback(() => playSound("notification"), [playSound]),
    playClaim: useCallback(() => playSound("claim"), [playSound]),
    playToggle: useCallback(() => playSound("toggle"), [playSound]),
    playOpen: useCallback(() => playSound("open"), [playSound]),
    playClose: useCallback(() => playSound("close"), [playSound]),
  }
}

// Context provider for global sound settings
import { createContext, createElement, useContext, type ReactNode } from "react"

interface SoundContextValue {
  playSound: (type: SoundType) => void
  soundEnabled: boolean
  toggleSound: () => void
  setSound: (enabled: boolean) => void
}

const SoundContext = createContext<SoundContextValue | null>(null)

export function SoundProvider({ children }: { children: ReactNode }) {
  const sounds = useButtonSounds()

  const value: SoundContextValue = {
    playSound: sounds.playSound,
    soundEnabled: sounds.soundEnabled,
    toggleSound: sounds.toggleSound,
    setSound: sounds.setSound,
  }

  // Using createElement so this file can stay a .ts module without JSX.
  return createElement(SoundContext.Provider, { value }, children)
}

export function useSounds() {
  const context = useContext(SoundContext)
  if (!context) {
    // Return a no-op version if used outside provider
    return {
      playSound: () => {},
      soundEnabled: false,
      toggleSound: () => {},
      setSound: () => {},
    }
  }
  return context
}

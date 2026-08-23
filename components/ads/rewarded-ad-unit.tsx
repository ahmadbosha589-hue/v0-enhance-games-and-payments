"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Play, CheckCircle2, Loader2, ShieldCheck } from "lucide-react"

/**
 * RewardedAdUnit — a single verified rewarded-ad placement.
 *
 * How it works
 * ------------
 * 1. On "Start", the unit POSTs /api/ads/rewarded-session to open a server-
 *    tracked session (the server picks the next configured network).
 * 2. The provider creative loads in the slot; the user watches the countdown.
 * 3. The provider's S2S callback hits /api/ads/rewarded-callback, which mints
 *    a single-use claim token bound to this session's txid.
 * 4. The unit polls /api/ads/rewarded-session/status until the token is
 *    available, then hands it to the parent (which claims the bonus).
 *
 * Nothing is claimable without the provider-verified token — client timers
 * alone never unlock rewards.
 */

interface RewardedAdUnitProps {
  index: number
  seconds?: number
  onVerified: (watchToken: string) => void
  className?: string
}

type Phase = "idle" | "loading" | "watching" | "verifying" | "done" | "error"

export function RewardedAdUnit({ index, seconds = 20, onVerified, className }: RewardedAdUnitProps) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [remaining, setRemaining] = useState(seconds)
  const [error, setError] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const start = async () => {
    if (phase !== "idle" && phase !== "error") return
    setError(null)
    setPhase("loading")

    try {
      const res = await fetch("/api/ads/rewarded-session", { method: "POST" })
      const data = await res.json()
      if (!res.ok || !data.sessionToken) {
        throw new Error(data.error || "No rewarded inventory available right now")
      }
      setSessionToken(data.sessionToken)
      setRemaining(seconds)
      setPhase("watching")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start")
      setPhase("error")
    }
  }

  // Countdown → then wait for the provider postback to mint the claim token.
  useEffect(() => {
    if (phase !== "watching") return
    const t = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(t)
          setPhase("verifying")
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [phase])

  // Poll for the verified token while verifying.
  useEffect(() => {
    if (phase !== "verifying" || !sessionToken) return

    let attempts = 0
    const maxAttempts = 30 // ~60s at 2s intervals
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const res = await fetch(`/api/ads/rewarded-session/status?session=${encodeURIComponent(sessionToken)}`)
        if (!res.ok) throw new Error("status failed")
        const data = await res.json()

        if (data.watchToken) {
          if (pollRef.current) clearInterval(pollRef.current)
          setPhase("done")
          onVerified(data.watchToken)
        } else if (attempts >= maxAttempts) {
          throw new Error("Verification timed out — the network did not confirm your view")
        }
      } catch (e) {
        if (pollRef.current) clearInterval(pollRef.current)
        setError(e instanceof Error ? e.message : "Verification failed")
        setPhase("error")
      }
    }, 2000)
  }, [phase, sessionToken, onVerified])

  const label = useMemo(() => {
    switch (phase) {
      case "idle": return `Start Ad #${index + 1}`
      case "loading": return "Loading…"
      case "watching": return `${remaining}s`
      case "verifying": return "Verifying…"
      case "done": return "Verified ✓"
      case "error": return error || "Retry"
    }
  }, [phase, remaining, index, error])

  return (
    <div
      className={cn(
        "relative rounded-xl border p-3 sm:p-4 transition-all",
        phase === "done" && "bg-green-500/10 border-green-500/30",
        phase === "watching" && "bg-primary/5 border-primary/30",
        phase === "error" && "bg-destructive/5 border-destructive/30",
        (phase === "idle" || phase === "loading") && "bg-muted/30",
        className,
      )}
      data-rewarded-unit={index}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs sm:text-sm font-medium">Ad #{index + 1}</span>
        {phase === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : phase === "verifying" ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : phase === "watching" ? (
          <span className="text-xs font-mono text-red-500">{remaining}s</span>
        ) : (
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Creative surface */}
      <div className="mt-1 min-h-[220px] rounded-lg bg-muted/50 border border-dashed flex items-center justify-center overflow-hidden">
        {phase === "idle" || phase === "loading" || phase === "error" ? (
          <button
            onClick={start}
            disabled={phase === "loading"}
            className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {phase === "loading" ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <Play className="h-8 w-8" />
            )}
            {label}
            {phase === "error" && <span className="text-[10px] text-destructive">{error}</span>}
          </button>
        ) : (
          /* The provider creative renders here via the rewarded-session ad tag.
             Until a provider is configured the server refuses session creation,
             so this state is only reachable with real inventory. */
          <iframe
            title={`Rewarded ad ${index + 1}`}
            className="w-full h-[220px] border-0"
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            ref={(el) => {
              if (!el || !sessionToken) return
              // The session endpoint returns the provider ad tag URL bound to
              // the session token; loading it attributes the impression.
              el.src = `/api/ads/rewarded-session/tag?session=${encodeURIComponent(sessionToken)}&unit=${index}`
            }}
          />
        )}
      </div>

      {/* Progress bar while watching */}
      {(phase === "watching" || phase === "verifying") && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-1000 ease-linear"
            style={{ width: `${phase === "verifying" ? 100 : ((seconds - remaining) / seconds) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}

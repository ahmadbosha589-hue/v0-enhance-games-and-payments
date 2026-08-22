"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Loader2, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface EndResult {
  winners_paid?: number
  total_distributed?: number
  already_completed?: boolean
}

export function AdminTournamentsActions() {
  const [isCreating, setIsCreating] = useState(false)
  const [endTarget, setEndTarget] = useState<{ id: string; title: string; prizePool: number | null } | null>(null)
  const [isEnding, setIsEnding] = useState(false)
  const [endResult, setEndResult] = useState<EndResult | null>(null)
  const router = useRouter()

  const handleCreateAll = async () => {
    setIsCreating(true)
    try {
      const response = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_all" }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(`${data.created ?? 0} tournament(s) created`, {
          description: data.created === 0 ? "All tournaments for the current periods already exist." : undefined,
        })
        router.refresh()
      } else {
        toast.error(data.error || "Failed to create tournaments")
      }
    } catch (error) {
      toast.error("Error creating tournaments")
      console.error(error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleEnd = async () => {
    if (!endTarget) return
    setIsEnding(true)
    try {
      const response = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", tournamentId: endTarget.id }),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Prize distribution failed")
      }

      // Surface the payout summary that was previously unreachable in the UI.
      setEndResult({
        winners_paid: data.winners_paid,
        total_distributed: data.total_distributed,
        already_completed: data.already_completed,
      })
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to end tournament")
    } finally {
      setIsEnding(false)
      setEndTarget(null)
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.refresh()}
        disabled={isCreating || isEnding}
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>
      <Button
        onClick={handleCreateAll}
        disabled={isCreating}
        className="gap-2"
      >
        {isCreating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" />
            Create All Tournaments
          </>
        )}
      </Button>

      {/* End confirmation — ending distributes the real prize pool. */}
      <Dialog open={!!endTarget} onOpenChange={(open) => !open && setEndTarget(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>End &quot;{endTarget?.title}&quot;?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This finalizes rankings and pays out the prize pool of{" "}
                  <strong>{(endTarget?.prizePool ?? 0).toLocaleString()} sats</strong>{" "}
                  to the top-ranked participants.
                </p>
                <p className="text-destructive">This cannot be undone.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndTarget(null)} disabled={isEnding}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleEnd} disabled={isEnding}>
              {isEnding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Distributing…
                </>
              ) : (
                "End Tournament & Pay Winners"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payout summary after ending */}
      <Dialog open={!!endResult} onOpenChange={(open) => !open && setEndResult(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tournament finalized</DialogTitle>
            <DialogDescription>
              {endResult?.already_completed
                ? "This tournament was already completed — no additional payouts were made."
                : `Paid ${endResult?.winners_paid ?? 0} winner(s) a total of ${(endResult?.total_distributed ?? 0).toLocaleString()} satoshis.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setEndResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

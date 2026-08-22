"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Square, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface EndTournamentButtonProps {
  tournamentId: string
  title: string
  prizePool: number | null
}

export function EndTournamentButton({ tournamentId, title, prizePool }: EndTournamentButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [result, setResult] = useState<{ winners_paid?: number; total_distributed?: number; already_completed?: boolean } | null>(null)
  const router = useRouter()

  const handleEnd = async () => {
    setConfirming(false)
    setIsEnding(true)
    try {
      const response = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", tournamentId }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Prize distribution failed")
      }
      setResult({
        winners_paid: data.winners_paid,
        total_distributed: data.total_distributed,
        already_completed: data.already_completed,
      })
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to end tournament")
    } finally {
      setIsEnding(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs text-amber-600 hover:text-amber-700 bg-transparent"
        onClick={() => setConfirming(true)}
        disabled={isEnding}
      >
        {isEnding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Square className="h-3 w-3 mr-1" />}
        End
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End &quot;{title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This finalizes rankings and pays out the prize pool of{" "}
                  <strong>{(prizePool ?? 0).toLocaleString()} sats</strong> to top-ranked participants.
                </p>
                <p className="text-destructive">This cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEnd}>End &amp; Pay Winners</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!result} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tournament finalized</DialogTitle>
            <DialogDescription>
              {result?.already_completed
                ? "This tournament was already completed — no additional payouts were made."
                : `Paid ${result?.winners_paid ?? 0} winner(s) a total of ${(result?.total_distributed ?? 0).toLocaleString()} satoshis.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

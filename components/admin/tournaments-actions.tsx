"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Loader2, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"

export function AdminTournamentsActions() {
  const [isCreating, setIsCreating] = useState(false)
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
        router.refresh()
      } else {
        console.error("Failed to create tournaments:", data.error)
      }
    } catch (error) {
      console.error("Error creating tournaments:", error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.refresh()}
        disabled={isCreating}
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
    </div>
  )
}

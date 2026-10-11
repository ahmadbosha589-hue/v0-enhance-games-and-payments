"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react"

interface PendingCampaign {
  id: string
  user_id: string
  name: string
  network: string
  title: string
  description: string | null
  image_url: string | null
  creative_url: string | null
  target_url: string
  budget: number
  created_at: string
  creative_status: string
  status: string
}

/**
 * Admin review queue for self-serve advertiser campaigns.
 *
 * GET /api/admin/advertise/review lists campaigns with creative_status
 * "pending"; POST approves (activates first-party delivery via serve_ad) or
 * rejects (auto-refunds the advertiser's balance via the refund_campaign RPC).
 */
export function CampaignReview() {
  const [items, setItems] = useState<PendingCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/advertise/review", { cache: "no-store" })
      const d = await r.json().catch(() => ({ campaigns: [] }))
      setItems(d.campaigns ?? [])
    } catch {
      toast.error("Failed to load the review queue")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const review = async (campaignId: string, action: "approve" | "reject") => {
    setActing(campaignId)
    try {
      const r = await fetch("/api/admin/advertise/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "reject"
            ? { campaignId, action, reason: "Rejected during manual review" }
            : { campaignId, action },
        ),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        toast.success(
          action === "approve"
            ? "Campaign approved — it is now live and delivering impressions"
            : `Campaign rejected${d.refunded ? ` — $${d.refunded} refunded to the advertiser` : ""}`,
        )
        setItems((prev) => prev.filter((c) => c.id !== campaignId))
      } else {
        toast.error(d.error || `Failed to ${action} campaign`)
      }
    } catch {
      toast.error(`Failed to ${action} campaign`)
    } finally {
      setActing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading review queue…
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground py-4">
          No campaigns awaiting review. New self-serve campaigns appear here the moment an
          advertiser creates one.
        </p>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} campaign{items.length === 1 ? "" : "s"} awaiting review
        </p>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline">{c.network}</Badge>
                  <span className="text-xs text-muted-foreground truncate">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </div>
                <Badge variant="secondary">${Number(c.budget).toFixed(2)}</Badge>
              </div>
              <div>
                <p className="font-medium text-sm">{c.title || c.name}</p>
                {c.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                )}
              </div>
              {(c.creative_url || c.image_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.creative_url || c.image_url || ""}
                  alt={`${c.name} creative`}
                  className="rounded max-h-32 w-full object-cover border"
                />
              )}
              <a
                href={c.target_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary flex items-center gap-1 break-all hover:underline"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.target_url}</span>
              </a>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-1"
                  disabled={acting === c.id}
                  onClick={() => review(c.id, "approve")}
                >
                  {acting === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Approve & Activate
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 gap-1"
                  disabled={acting === c.id}
                  onClick={() => review(c.id, "reject")}
                >
                  <XCircle className="h-4 w-4" />
                  Reject & Refund
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

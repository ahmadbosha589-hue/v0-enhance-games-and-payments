"use client"

import { useRef } from "react"
import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"
import { isNetworkRenderable } from "@/lib/ads/registry"
import { AlertCircle, ArrowDown, CheckCircle2, Cookie, Megaphone } from "lucide-react"
import { cn } from "@/lib/utils"

interface SupportUsContentProps {
  userId: string
}

// Exactly 11 partner networks; Google AdSense is intentionally excluded from
// this incentivized/support surface.
const AD_NETWORKS = [
  { id: "a-ads", name: "A-ADS" },
  { id: "coinzilla", name: "CoinZilla" },
  { id: "bitmedia", name: "BitMedia" },
  { id: "cointraffic", name: "CoinTraffic" },
  { id: "medianet", name: "Media.net" },
  { id: "hilltopads", name: "HilltopAds" },
  { id: "adsterra", name: "Adsterra" },
  { id: "propellerads", name: "PropellerAds" },
  { id: "trafficstars", name: "TrafficStars" },
  { id: "mellowads", name: "MellowAds" },
  { id: "adskeeper", name: "AdsKeeper" },
] as const

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((response) => response.json())

export function SupportUsContent({ userId }: SupportUsContentProps) {
  const { data: statsData } = useSWR(`/api/support-stats?userId=${encodeURIComponent(userId)}`, fetcher, {
    revalidateOnFocus: false,
  })

  const configuredCount = AD_NETWORKS.filter((network) => isNetworkRenderable(network.id)).length
  const inventoryRef = useRef<HTMLDivElement>(null)

  const scrollToInventory = () => {
    inventoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <section className="space-y-5" data-support-user={userId}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
            <Megaphone className="h-5 w-5 text-primary" aria-hidden="true" />
            Partner advertising inventory
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Eleven aligned partner slots are listed below. Only verified, configured networks can render inventory.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          {configuredCount} of {AD_NETWORKS.length} verified
        </Badge>
        <Button type="button" variant="outline" size="sm" className="w-fit gap-2" onClick={scrollToInventory}>
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
          View partner ads
        </Button>
      </div>

      <Alert className="border-muted bg-muted/20">
        <Cookie className="h-4 w-4" />
        <AlertDescription className="text-xs sm:text-sm">
          Enable Marketing cookies to view eligible partner inventory. Google AdSense is not rendered on this
          support/reward surface.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {AD_NETWORKS.map((network) => {
          const verified = isNetworkRenderable(network.id)
          return (
            <Card key={network.id} className={cn("border-muted", verified && "border-emerald-500/30")}>
              <CardContent className="flex min-h-24 items-center gap-3 p-4">
                {verified ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{network.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {verified ? "Verified tag enabled" : "Awaiting verified tag/configuration"}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div ref={inventoryRef} id="support-partner-inventory" className="scroll-mt-6">
        <MultiNetworkAds
          position="content"
          layout="grid"
          density="compact"
          lazyLoad={false}
          priority="medium"
          showLabels
          className="rounded-xl"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {statsData?.adsWatchedToday ? `${statsData.adsWatchedToday} support views recorded today.` : "Support activity is recorded only when a verified provider reports a valid event."}
      </p>
    </section>
  )
}

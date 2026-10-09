"use client"

import { useRef } from "react"
import useSWR from "swr"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { MultiNetworkAds } from "@/components/ads/multi-network-ads"
import { AAdsAdaptiveUnit } from "@/components/ads/aads-adaptive-unit"
import { ArrowDown, Cookie, Megaphone } from "lucide-react"

interface SupportUsContentProps {
  userId: string
}

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((response) => response.json())

export function SupportUsContent({ userId }: SupportUsContentProps) {
  const { data: statsData } = useSWR(`/api/support-stats?userId=${encodeURIComponent(userId)}`, fetcher, {
    revalidateOnFocus: false,
  })

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
            Watch and support us — every view helps keep the faucet running.
          </p>
        </div>
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

      {/* The actual ad inventory — real creative from every renderable
          network, not configuration status cards. Which networks serve a
          creative at any moment is controlled in the admin panel (Admin →
          Ads → Networks) and by each visitor's ad-network consent; this
          page just shows the ads. */}
      <div ref={inventoryRef} id="support-partner-inventory" className="scroll-mt-6 space-y-4">
        {/* A-ADS adaptive banner — always renderable. */}
        <AAdsAdaptiveUnit />
        {/* The partner grid: real tags from every registry-enabled network
            that has credentials (A-ADS / Coinzilla / Bitmedia), plus the
            c.cx.ua partner banner. */}
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

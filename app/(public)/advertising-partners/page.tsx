import type { Metadata } from "next"
import Link from "next/link"
import { AD_NETWORKS, enabledNetworks, getNetwork } from "@/lib/ads/registry"
import { PLATFORM_CONFIG } from "@/lib/constants/config"

export const metadata: Metadata = {
  title: "Advertising Partners Disclosure",
  description: `Current advertising-partner registry status for ${PLATFORM_CONFIG.name}.`,
}

const unverifiedNetworks = AD_NETWORKS.filter((network) => Boolean(network.disabledReason))
const activeNetworks = enabledNetworks()
const adsenseActive = getNetwork("google")?.enabled === true
const allUnverifiedNetworksDisabled = unverifiedNetworks.every((network) => !network.enabled)

export default function AdvertisingPartnersPage() {
  return (
    <div className="container max-w-4xl py-16">
      <h1 className="mb-4 text-4xl font-bold tracking-tight">Advertising Partners Disclosure</h1>
      <p className="mb-8 text-muted-foreground">
        This page reports the current status of the publisher-network registry used by {PLATFORM_CONFIG.name}. The
        list below is generated from that registry and does not add any provider, account, or integration that is not
        recorded there.
      </p>

      <section aria-labelledby="advertising-status" className="mb-10">
        <h2 id="advertising-status" className="mb-4 text-2xl font-semibold">
          Current status
        </h2>
        <ul className="list-disc space-y-3 pl-6 text-muted-foreground">
          <li>
            {allUnverifiedNetworksDisabled
              ? "Every network currently marked as unverified is disabled."
              : "Not every network currently marked as unverified is disabled; this disclosure requires review."}
          </li>
          <li>
            {adsenseActive
              ? "A Google AdSense publisher integration is active."
              : "No AdSense publisher integration is active."}
          </li>
          <li>
            {activeNetworks.length === 0
              ? "No advertising networks in the registry are enabled at this time."
              : `${activeNetworks.length} advertising network${activeNetworks.length === 1 ? "" : "s"} in the registry ${activeNetworks.length === 1 ? "is" : "are"} enabled.`}
          </li>
        </ul>
      </section>

      <section aria-labelledby="registered-networks" className="mb-10">
        <h2 id="registered-networks" className="mb-4 text-2xl font-semibold">
          Registered networks
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border/50 bg-muted/30">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Network
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Registry note
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {AD_NETWORKS.map((network) => (
                <tr key={network.id}>
                  <th scope="row" className="px-4 py-3 font-medium">
                    {network.name}
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">{network.enabled ? "Enabled" : "Disabled"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {network.enabled ? "Enabled in the publisher registry." : network.disabledReason || "Disabled in the publisher registry."}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 text-muted-foreground">
        <p>
          Marketing-cookie controls are available on the{" "}
          <Link href="/cookies" className="text-primary hover:underline">
            Cookie Preferences
          </Link>{" "}
          page. Optional marketing technology is gated by an explicit marketing-cookie choice; that choice does not
          enable a network that is disabled in this registry.
        </p>
        <p>
          For the broader data-use explanation, see the{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </section>
    </div>
  )
}

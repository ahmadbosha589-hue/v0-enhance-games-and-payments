export type FirstPartyPlacement = "header" | "sidebar" | "content" | "footer"

export function channelForPlacement(placement: FirstPartyPlacement): "banner-network" | "native-ads" {
  return placement === "content" ? "native-ads" : "banner-network"
}

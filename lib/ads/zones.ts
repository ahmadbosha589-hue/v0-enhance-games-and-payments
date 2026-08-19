export type AdZone = "adsense-eligible" | "incentivized" | "none"

export function resolveAdZone(pathname: string): AdZone {
  if (pathname.startsWith("/dashboard")) return "incentivized"
  if (pathname.startsWith("/admin")) return "none"
  if (pathname.startsWith("/auth")) return "none"
  return "adsense-eligible"
}

export function assertAdsenseAllowed(pathname: string): boolean {
  return resolveAdZone(pathname) === "adsense-eligible"
}

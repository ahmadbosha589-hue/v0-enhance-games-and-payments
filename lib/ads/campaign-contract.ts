import { isSafeTargetUrl } from "@/lib/ads/safe-target-url"

export function validateCreativeUrl(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && isSafeTargetUrl(value)
}

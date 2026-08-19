import { isIP } from "node:net"

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = octets
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === "::1" || normalized === "::" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb")
}

export function isSafeTargetUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password) return false
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) return false

    const ipVersion = isIP(hostname)
    if (ipVersion === 4 && isPrivateIpv4(hostname)) return false
    if (ipVersion === 6 && isPrivateIpv6(hostname)) return false
    return true
  } catch {
    return false
  }
}

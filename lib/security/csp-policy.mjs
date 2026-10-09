/** @type {string[]} */
const SCRIPT_HOSTS = [
  "https://challenges.cloudflare.com",
  "https://js.hcaptcha.com",
  "https://hcaptcha.com",
  "https://*.hcaptcha.com",
  "https://c.cx.ua",
  "https://sad.adsgram.ai",
  "https://a-ads.com",
  "https://coinzillatag.com",
  "https://bitmedianetwork.com",
]

const SCRIPT_HASHES = [
  // Exact next-themes bootstrap emitted by the current Next.js production build.
  // scripts/verify-csp-hash.mjs checks this against generated HTML after every build.
  "'sha256-zjP2BXYgSCCnXNMXI2IL1yRydoQdsGR/uCCr6kyKsD0='",
]

/** @type {string[]} */
const NON_SCRIPT_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.faucetpay.io https://hcaptcha.com https://*.hcaptcha.com https://c.cx.ua https://api.adsgram.ai",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://challenges.cloudflare.com https://hcaptcha.com https://*.hcaptcha.com https://c.cx.ua https://ad.a-ads.com https://acceptable.a-ads.com https://bitmedia.io https://offers.cpx-research.com https://torox.io https://wall.adgaterewards.com https://wall.lootably.com https://web.bitlabs.ai https://notik.me https://timewall.io https://www.ayetstudios.com https://wannads.com https://offers.monlix.com https://wall.revenueuniverse.com https://adgem.com https://www.pollfish.com https://theoremreach.com https://hangmyads.com https://offerwall.me https://bicotasks.com https://mmwall.io https://adscendmedia.com https://cpalead.com https://minutestaff.com",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
  "report-uri /api/security/csp-report",
]

/**
 * Build the shared response policy. Static/ISR pages retain Next.js bootstrap
 * compatibility; already-dynamic sensitive pages use a request nonce instead.
 *
 * @param {string} [nonce] A cryptographically random base64 nonce.
 */
export function buildCspPolicy(nonce) {
  if (nonce !== undefined && !/^[A-Za-z0-9+/]+={0,2}$/.test(nonce)) {
    throw new TypeError("CSP nonce must be base64 encoded")
  }

  const scriptSources = [
    "'self'",
    nonce === undefined ? "'unsafe-inline'" : `'nonce-${nonce}'`,
    ...(nonce === undefined ? [] : ["'strict-dynamic'"]),
    ...(nonce === undefined ? [] : SCRIPT_HASHES),
    ...SCRIPT_HOSTS,
  ]
  return [`script-src ${scriptSources.join(" ")}`, ...NON_SCRIPT_DIRECTIVES].join("; ")
}

import { buildCspPolicy } from "./lib/security/csp-policy.mjs"

/** @type {import('next').NextConfig} */
// The static policy preserves SSG compatibility. The proxy adds a nonce policy
// for sensitive routes that are already dynamically rendered.
const cspEnforcing = buildCspPolicy()

const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  // Keep first-party /public images on Next's optimized image pipeline. External
  // images that cannot be allowlisted opt into `unoptimized` at the call site.
  images: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stops MIME-type sniffing attacks (e.g. a user-uploaded file
          // being executed as script).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Send full referrer same-origin, origin-only cross-origin.
          // IMPORTANT: c.cx.ua validates the Referer origin to serve ads —
          // this policy still sends "https://<our-domain>/" cross-origin,
          // so ad serving keeps working. Do NOT tighten to "no-referrer".
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Enforcing policy, constrained to active integrations: CAPTCHA,
          // c.cx.ua, AdsGram and configured offerwall iframe origins.
          // Add vendors only after verifying their exact runtime requirements.
          { key: "Content-Security-Policy", value: cspEnforcing },
          // Force HTTPS for 2 years once seen over HTTPS (production).
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          // Authenticated app with balances/withdrawals: block other sites
          // from framing us (clickjacking protection).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // We use none of these powerful browser features — deny them so
          // injected third-party scripts can't either.
          {
            key: "Permissions-Policy",
            value: "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
          },
        ],
      },
    ]
  },
}

export default nextConfig

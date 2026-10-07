/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
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
          // Force HTTPS for 2 years once seen over HTTPS (production).
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          // Authenticated app with balances/withdrawals: block other sites
          // from framing us (clickjacking protection).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // We use none of these powerful browser features — deny them so
          // injected third-party scripts can't either.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ]
  },
}

export default nextConfig

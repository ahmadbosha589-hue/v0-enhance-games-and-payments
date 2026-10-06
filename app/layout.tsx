import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import Script from "next/script"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { QueryProvider } from "@/components/providers/query-provider"
import { LanguageProvider } from "@/lib/i18n/language-context"
import { PWAProvider } from "@/components/pwa/pwa-provider"
import { Toaster } from "@/components/ui/sonner"
import { SecurityInit } from "@/components/security/security-init"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "Faucero - Earn Free Bitcoin Every 5 Minutes",
    template: "%s | Faucero",
  },
  description:
    "Claim free satoshis every 5 minutes. Build your streak, refer friends, and withdraw to FaucetPay. The most trusted crypto faucet platform.",
  keywords: [
    "crypto faucet",
    "free bitcoin",
    "earn satoshis",
    "faucetpay",
    "bitcoin faucet",
    "free cryptocurrency",
    "earn crypto",
    "bitcoin rewards",
    "faucero",
  ],
  authors: [{ name: "Faucero Team" }],
  creator: "Faucero",
  publisher: "Faucero",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://faucero.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Faucero",
    title: "Faucero - Earn Free Bitcoin Every 5 Minutes",
    description: "Claim free satoshis every 5 minutes. Build your streak, refer friends, and withdraw to FaucetPay.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Faucero - The Most Trusted Crypto Faucet Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Faucero - Earn Free Bitcoin Every 5 Minutes",
    description: "Claim free satoshis every 5 minutes. Build your streak, refer friends, and withdraw to FaucetPay.",
    images: ["/og-image.png"],
    creator: "@faucero",
    site: "@faucero",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.jpg", sizes: "180x180" }],
    shortcut: "/favicon.ico",
  },
  manifest: "/manifest.json",
  category: "finance",
  generator: "v0.app",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  colorScheme: "dark light",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning dir="ltr">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-1XJ0BSE9YZ"
          strategy="beforeInteractive"
        />
        <Script id="google-analytics" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-1XJ0BSE9YZ');
          `}
        </Script>

        {/* Font preconnects */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
        
        {/* Ad network preconnects for faster loading - non-blocking */}
        <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://a-ads.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://coinzilla.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com" />
        <link rel="dns-prefetch" href="https://a-ads.com" />
        <link rel="dns-prefetch" href="https://coinzilla.com" />
        <link rel="dns-prefetch" href="https://bitmedia.io" />
        <link rel="dns-prefetch" href="https://cointraffic.io" />
        <link rel="dns-prefetch" href="https://adsterra.com" />
        <link rel="dns-prefetch" href="https://hilltopads.com" />
        <link rel="dns-prefetch" href="https://mellowads.com" />
        <link rel="preconnect" href="https://c.cx.ua" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://c.cx.ua" />

        {/*
          Structured data for SEO.
          suppressHydrationWarning: required because the v0 preview sandbox
          (and some browser extensions / ad blockers in production) inject
          into the first <script> tag in <head>, which causes a benign
          server/client attribute mismatch. The script is still rendered
          correctly server-side for SEO crawlers — we just don't want React
          to log a hydration warning for the injection.
        */}
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Faucero",
              url: process.env.NEXT_PUBLIC_APP_URL || "https://faucero.com",
              description:
                "Claim free satoshis every 5 minutes. Build your streak, refer friends, and withdraw to FaucetPay.",
              applicationCategory: "FinanceApplication",
              operatingSystem: "Web",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
            }),
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <SecurityInit />
        <QueryProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
            <LanguageProvider>
              <PWAProvider>{children}</PWAProvider>
              <Toaster richColors position="bottom-right" closeButton />
            </LanguageProvider>
          </ThemeProvider>
        </QueryProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}

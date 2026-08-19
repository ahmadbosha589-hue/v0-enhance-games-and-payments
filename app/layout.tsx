import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { QueryProvider } from "@/components/providers/query-provider"
import { LanguageProvider } from "@/lib/i18n/language-context"
import { PWAProvider } from "@/components/pwa/pwa-provider"
import { Toaster } from "@/components/ui/sonner"
import { SecurityInit } from "@/components/security/security-init"
import { ConsentBanner } from "@/components/consent/consent-banner"
import { ConsentAwareAnalytics } from "@/components/consent/consent-aware-analytics"
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
        {/* Font preconnects */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />

        {/* Structured data for SEO. */}
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
        <ConsentBanner />
        <QueryProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
            <LanguageProvider>
              <PWAProvider>{children}</PWAProvider>
              <Toaster richColors position="bottom-right" closeButton />
            </LanguageProvider>
          </ThemeProvider>
        </QueryProvider>
        <ConsentAwareAnalytics />
      </body>
    </html>
  )
}

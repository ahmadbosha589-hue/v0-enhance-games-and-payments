import type { Metadata } from "next"
import Link from "next/link"
import CookiePreferences from "@/components/cookies/cookie-preferences"

export const metadata: Metadata = {
  title: "Cookie Policy | CryptoFaucet",
  description: "Learn about how CryptoFaucet uses cookies and similar technologies.",
}

export default function CookiePolicyPage() {
  return (
    <>
      <CookiePreferences />
      <div className="container max-w-4xl pb-16">
        <p className="text-center text-sm text-muted-foreground">
          For the current registry-backed advertising status, see our{" "}
          <Link href="/advertising-partners" className="text-primary hover:underline">
            Advertising Partners Disclosure
          </Link>
          .
        </p>
      </div>
    </>
  )
}

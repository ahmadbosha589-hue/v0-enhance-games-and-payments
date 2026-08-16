import type { Metadata } from "next"
import CookiePreferences from "@/components/cookies/cookie-preferences"

export const metadata: Metadata = {
  title: "Cookie Policy | CryptoFaucet",
  description: "Learn about how CryptoFaucet uses cookies and similar technologies.",
}

export default function CookiePolicyPage() {
  return <CookiePreferences />
}

import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Authentication",
  description: "Sign in or create an account to start earning crypto",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

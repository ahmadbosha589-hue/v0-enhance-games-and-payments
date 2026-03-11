import type { MetadataRoute } from "next"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://cryptofaucet.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  // Static pages
  const staticPages = [
    { url: "", priority: 1.0, changeFrequency: "daily" as const },
    { url: "/about", priority: 0.8, changeFrequency: "monthly" as const },
    { url: "/contact", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/help", priority: 0.8, changeFrequency: "weekly" as const },
    { url: "/blog", priority: 0.9, changeFrequency: "daily" as const },
    { url: "/terms", priority: 0.5, changeFrequency: "yearly" as const },
    { url: "/privacy", priority: 0.5, changeFrequency: "yearly" as const },
    { url: "/cookies", priority: 0.4, changeFrequency: "yearly" as const },
    { url: "/aml", priority: 0.4, changeFrequency: "yearly" as const },
    { url: "/careers", priority: 0.6, changeFrequency: "weekly" as const },
    { url: "/status", priority: 0.7, changeFrequency: "hourly" as const },
    { url: "/docs/api", priority: 0.8, changeFrequency: "weekly" as const },
    { url: "/auth/login", priority: 0.9, changeFrequency: "monthly" as const },
    { url: "/auth/sign-up", priority: 0.9, changeFrequency: "monthly" as const },
  ]

  return staticPages.map((page) => ({
    url: `${BASE_URL}${page.url}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }))
}

"use client"

import type React from "react"
import Link from "next/link"
import { LogoFull } from "@/components/icons/logo"
import { PLATFORM_CONFIG } from "@/lib/constants/config"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useLanguage } from "@/lib/i18n/language-context"
import { LanguageSelector } from "@/components/language-selector"
import { ThemeToggle } from "@/components/theme-toggle"

const socialLinks = [
  {
    name: "Twitter",
    href: PLATFORM_CONFIG.social.twitter,
    icon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    name: "Discord",
    href: PLATFORM_CONFIG.social.discord,
    icon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
  {
    name: "Telegram",
    href: PLATFORM_CONFIG.social.telegram,
    icon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
]

export function Footer() {
  const { t, isRTL } = useLanguage()

  const footerLinks = {
    product: [
      { labelKey: "nav.features" as const, href: "/#features" },
      { labelKey: "nav.howItWorks" as const, href: "/#how-it-works" },
      { labelKey: "nav.faq" as const, href: "/#faq" },
    ],
    company: [
      { labelKey: "footer.about" as const, href: "/about" },
      { labelKey: "footer.blog" as const, href: "/blog" },
      { labelKey: "footer.contact" as const, href: "/contact" },
    ],
    legal: [
      { labelKey: "footer.terms" as const, href: "/terms" },
      { labelKey: "footer.privacy" as const, href: "/privacy" },
      { labelKey: "footer.cookies" as const, href: "/cookies" },
      { labelKey: "footer.aml" as const, href: "/aml" },
    ],
    support: [
      { labelKey: "footer.help" as const, href: "/help" },
      { labelKey: "footer.community" as const, href: PLATFORM_CONFIG.social.discord },
      { labelKey: "footer.status" as const, href: "/status" },
    ],
  }

  return (
    <footer className="relative border-t border-border/30 bg-gradient-to-b from-muted/20 to-muted/40 overflow-hidden" role="contentinfo" dir={isRTL ? "rtl" : "ltr"}>
      {/* Subtle background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -right-20 top-0 h-32 w-32 rounded-full bg-accent/5 blur-2xl" />
      </div>
      <div className="container relative px-4 sm:px-6 py-10 sm:py-14 lg:py-20">
        <div className="grid gap-10 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link href="/" aria-label="Faucero Home" className="inline-block transition-opacity hover:opacity-80">
              <LogoFull size="sm" className="mb-5" />
            </Link>
            <p className="mb-5 sm:mb-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t("footer.description")}
            </p>
            <div className="flex gap-3" role="list" aria-label="Social media links">
              {socialLinks.map((social) => (
                <Link
                  key={social.name}
                  href={social.href}
                  className="flex items-center justify-center h-10 w-10 rounded-xl bg-muted/50 text-muted-foreground transition-all duration-300 hover:bg-primary/10 hover:text-primary hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Follow us on ${social.name}`}
                >
                  <social.icon className="h-4.5 w-4.5" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>

          {/* Links - Better spacing and responsive layout */}
          <nav aria-label="Product links">
            <h3 className="mb-4 text-sm font-bold tracking-tight">{t("footer.product")}</h3>
            <ul className="space-y-2.5" role="list">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors duration-200 hover:text-primary"
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company links">
            <h3 className="mb-4 text-sm font-bold tracking-tight">{t("footer.company")}</h3>
            <ul className="space-y-2.5" role="list">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors duration-200 hover:text-primary"
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal links">
            <h3 className="mb-4 text-sm font-bold tracking-tight">{t("footer.legal")}</h3>
            <ul className="space-y-2.5" role="list">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors duration-200 hover:text-primary"
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Support links">
            <h3 className="mb-4 text-sm font-bold tracking-tight">{t("footer.support")}</h3>
            <ul className="space-y-2.5" role="list">
              {footerLinks.support.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors duration-200 hover:text-primary"
                    target={link.href.startsWith("http") ? "_blank" : undefined}
                    rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <Separator className="my-8 sm:my-10 bg-border/40" />

        {/* Bottom - Better mobile layout */}
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2.5 order-1 sm:order-2">
            <LanguageSelector />
            <ThemeToggle />
            <Badge variant="outline" className="text-xs hidden sm:flex font-medium border-border/50">
              v1.0.0
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground text-center sm:text-start order-2 sm:order-1">
            © {new Date().getFullYear()} {PLATFORM_CONFIG.name}. {t("footer.rights")}
          </p>
        </div>
      </div>
    </footer>
  )
}

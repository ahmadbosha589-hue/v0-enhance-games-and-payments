"use client"

import type React from "react"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Search, Coins, Wallet, Users, Shield, Settings, HelpCircle } from "lucide-react"
import { useState, useEffect } from "react"

const categories = [
  {
    icon: Coins,
    title: "Claims & Earnings",
    description: "How to claim, bonuses, and earning tips",
    href: "#claims",
  },
  {
    icon: Wallet,
    title: "Withdrawals",
    description: "FaucetPay setup and withdrawal process",
    href: "#withdrawals",
  },
  {
    icon: Users,
    title: "Referral Program",
    description: "How referrals work and commission tiers",
    href: "#referrals",
  },
  {
    icon: Shield,
    title: "Security",
    description: "Account protection and 2FA setup",
    href: "#security",
  },
  {
    icon: Settings,
    title: "Account Settings",
    description: "Profile, preferences, and customization",
    href: "#account",
  },
  {
    icon: HelpCircle,
    title: "Troubleshooting",
    description: "Common issues and solutions",
    href: "#troubleshooting",
  },
]

const faqs = {
  claims: [
    {
      q: "How often can I claim?",
      a: "You can claim free satoshis every 5 minutes. A timer shows when your next claim is available.",
    },
    {
      q: "What is the streak bonus?",
      a: "Each consecutive day you claim, your bonus increases by 10%, up to a maximum of 100% (after 10 days). Missing a day resets your streak.",
    },
    {
      q: "Why was my claim flagged?",
      a: "Claims may be flagged for review if our fraud detection system detects suspicious activity. This is to protect all users from abuse.",
    },
  ],
  withdrawals: [
    {
      q: "What is the minimum withdrawal?",
      a: "The minimum withdrawal amount is 10,000 satoshis (0.0001 BTC).",
    },
    {
      q: "How do I set up FaucetPay?",
      a: "Create an account at FaucetPay.io, then link your FaucetPay email in your dashboard settings. Make sure the email matches exactly.",
    },
    {
      q: "How long do withdrawals take?",
      a: "Withdrawals are processed instantly to FaucetPay. You should see your balance update within 1 minute.",
    },
  ],
  referrals: [
    {
      q: "How do referrals work?",
      a: "Share your unique referral link. When someone signs up and claims, you earn a percentage of their claims forever.",
    },
    {
      q: "What are the commission rates?",
      a: "Tier 1 (direct referrals): 10%, Tier 2: 5%, Tier 3: 2%. There's no limit to how many people you can refer.",
    },
    {
      q: "When do I receive referral earnings?",
      a: "Referral earnings are credited instantly whenever your referrals make a claim.",
    },
  ],
  security: [
    {
      q: "How do I enable 2FA?",
      a: "Go to Settings > Security and click 'Enable 2FA'. Scan the QR code with an authenticator app like Google Authenticator or Authy.",
    },
    {
      q: "What if I lose access to my 2FA?",
      a: "Contact support with your account email and we'll help verify your identity to recover your account.",
    },
    {
      q: "Is my data safe?",
      a: "Yes, we use industry-standard encryption and security measures. See our Privacy Policy for details.",
    },
  ],
  account: [
    {
      q: "How do I change my display name?",
      a: "Go to Dashboard > Profile and click on your name to edit it. Changes are saved automatically.",
    },
    {
      q: "Can I change my email address?",
      a: "For security reasons, email changes require verification. Contact support for assistance.",
    },
    {
      q: "How do I delete my account?",
      a: "Contact support with your account email. Note that this action is irreversible and all earnings will be lost.",
    },
  ],
  troubleshooting: [
    {
      q: "Why can't I claim?",
      a: "Check if: 1) Your cooldown has expired, 2) You've completed the captcha, 3) Ad-blockers are disabled.",
    },
    {
      q: "My withdrawal is pending for too long",
      a: "Withdrawals are usually processed within 5 minutes. If pending longer, contact support with your withdrawal ID.",
    },
    {
      q: "The site isn't loading properly",
      a: "Try clearing your browser cache, disabling extensions, or using a different browser.",
    },
  ],
}

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleCategoryClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault()
    const targetId = href.replace("#", "")
    const element = document.getElementById(targetId)
    if (element) {
      const headerOffset = 100
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      })
    }
  }

  // Filter FAQs based on search
  const filterFaqs = (faqList: { q: string; a: string }[]) => {
    if (!searchQuery.trim()) return faqList
    return faqList.filter(
      (faq) =>
        faq.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.a.toLowerCase().includes(searchQuery.toLowerCase()),
    )
  }

  return (
    <div className="container py-16">
      {/* Header */}
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">Help Center</h1>
        <p className="mb-6 text-muted-foreground">Find answers to common questions or contact our support team.</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search for help..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Categories */}
      <div className="mb-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <a
            key={category.title}
            href={category.href}
            onClick={(e) => handleCategoryClick(e, category.href)}
            className="block cursor-pointer"
          >
            <Card className="h-full border-border/50 transition-colors hover:border-primary/50">
              <CardContent className="flex items-start gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <category.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">{category.title}</h3>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      {/* FAQ Sections */}
      <div className="space-y-12">
        {/* Claims */}
        <section id="claims">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" />
                Claims & Earnings
              </CardTitle>
              <CardDescription>Everything about claiming and earning satoshis</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {filterFaqs(faqs.claims).map((faq, i) => (
                  <AccordionItem key={i} value={`claims-${i}`}>
                    <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
                {filterFaqs(faqs.claims).length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">No matching questions found.</p>
                )}
              </Accordion>
            </CardContent>
          </Card>
        </section>

        {/* Withdrawals */}
        <section id="withdrawals">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Withdrawals
              </CardTitle>
              <CardDescription>How to withdraw your earnings</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {filterFaqs(faqs.withdrawals).map((faq, i) => (
                  <AccordionItem key={i} value={`withdrawals-${i}`}>
                    <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
                {filterFaqs(faqs.withdrawals).length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">No matching questions found.</p>
                )}
              </Accordion>
            </CardContent>
          </Card>
        </section>

        {/* Referrals */}
        <section id="referrals">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Referral Program
              </CardTitle>
              <CardDescription>Earn by inviting friends</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {filterFaqs(faqs.referrals).map((faq, i) => (
                  <AccordionItem key={i} value={`referrals-${i}`}>
                    <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
                {filterFaqs(faqs.referrals).length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">No matching questions found.</p>
                )}
              </Accordion>
            </CardContent>
          </Card>
        </section>

        {/* Security */}
        <section id="security">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Security
              </CardTitle>
              <CardDescription>Keep your account safe</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {filterFaqs(faqs.security).map((faq, i) => (
                  <AccordionItem key={i} value={`security-${i}`}>
                    <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
                {filterFaqs(faqs.security).length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">No matching questions found.</p>
                )}
              </Accordion>
            </CardContent>
          </Card>
        </section>

        {/* Account Settings */}
        <section id="account">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Account Settings
              </CardTitle>
              <CardDescription>Profile, preferences, and customization</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {filterFaqs(faqs.account).map((faq, i) => (
                  <AccordionItem key={i} value={`account-${i}`}>
                    <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
                {filterFaqs(faqs.account).length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">No matching questions found.</p>
                )}
              </Accordion>
            </CardContent>
          </Card>
        </section>

        {/* Troubleshooting */}
        <section id="troubleshooting">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                Troubleshooting
              </CardTitle>
              <CardDescription>Common issues and solutions</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {filterFaqs(faqs.troubleshooting).map((faq, i) => (
                  <AccordionItem key={i} value={`troubleshooting-${i}`}>
                    <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
                {filterFaqs(faqs.troubleshooting).length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">No matching questions found.</p>
                )}
              </Accordion>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Contact CTA */}
      <div className="mt-16 rounded-2xl border border-border/50 bg-muted/30 p-8 text-center">
        <h2 className="mb-2 text-2xl font-bold">Still need help?</h2>
        <p className="mb-6 text-muted-foreground">Our support team is here to help you with any questions or issues.</p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Contact Support
          </Link>
          <Link
            href="https://discord.gg/cryptofaucet"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Join Discord
          </Link>
        </div>
      </div>
    </div>
  )
}

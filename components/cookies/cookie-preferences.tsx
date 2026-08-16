"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { PLATFORM_CONFIG } from "@/lib/constants/config"
import { Cookie, Shield, BarChart3, Target, Settings, Check } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const COOKIE_CONSENT_KEY = "cookie_preferences"

interface CookiePreferencesState {
  analytics: boolean
  functional: boolean
  marketing: boolean
}

const defaultPreferences: CookiePreferencesState = {
  analytics: false,
  functional: false,
  marketing: false,
}

const cookieTypes = [
  {
    icon: Shield,
    key: "essential" as const,
    name: "Essential Cookies",
    required: true,
    description:
      "These cookies are necessary for the website to function properly. They enable core functionality such as security, network management, and account authentication.",
    examples: [
      { name: "session_id", purpose: "Maintains your logged-in state", duration: "Session" },
      { name: "csrf_token", purpose: "Protects against cross-site request forgery", duration: "Session" },
      { name: "auth_token", purpose: "Authenticates your identity", duration: "7 days" },
    ],
  },
  {
    icon: BarChart3,
    key: "analytics" as const,
    name: "Analytics Cookies",
    required: false,
    description:
      "These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously.",
    examples: [
      { name: "_ga", purpose: "Google Analytics tracking", duration: "2 years" },
      { name: "_gid", purpose: "Distinguishes users", duration: "24 hours" },
      { name: "plausible_analytics", purpose: "Privacy-focused analytics", duration: "Session" },
    ],
  },
  {
    icon: Settings,
    key: "functional" as const,
    name: "Functional Cookies",
    required: false,
    description:
      "These cookies enable enhanced functionality and personalization, such as remembering your preferences and settings.",
    examples: [
      { name: "theme", purpose: "Remembers dark/light mode preference", duration: "1 year" },
      { name: "language", purpose: "Stores your language preference", duration: "1 year" },
      { name: "timezone", purpose: "Stores your timezone for accurate times", duration: "1 year" },
    ],
  },
  {
    icon: Target,
    key: "marketing" as const,
    name: "Marketing Cookies",
    required: false,
    description:
      "These cookies may be set through our site by advertising partners to build a profile of your interests and show relevant ads on other sites.",
    examples: [
      { name: "_fbp", purpose: "Facebook pixel for ad targeting", duration: "3 months" },
      { name: "referral_source", purpose: "Tracks referral attribution", duration: "30 days" },
    ],
  },
]

export default function CookiePreferences() {
  const { toast } = useToast()
  const [preferences, setPreferences] = useState<CookiePreferencesState>(defaultPreferences)
  const [saved, setSaved] = useState(false)

  // Load saved preferences on mount
  useEffect(() => {
    const savedPrefs = localStorage.getItem(COOKIE_CONSENT_KEY)
    if (savedPrefs) {
      try {
        const parsed = JSON.parse(savedPrefs)
        setPreferences(parsed)
      } catch {
        // Invalid saved preferences, use defaults
      }
    }
  }, [])

  const savePreferences = (prefs: CookiePreferencesState) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(prefs))
    setPreferences(prefs)
    setSaved(true)
    // Notify all ad-loading components in the current tab (useAdConsent)
    // immediately, since the native `storage` event only fires in OTHER
    // tabs/windows, not the one that made the change.
    window.dispatchEvent(new Event("cookie-preferences-updated"))
    toast({
      title: "Cookie preferences saved",
      description: "Your cookie preferences have been updated successfully.",
    })
    setTimeout(() => setSaved(false), 3000)
  }

  const handleToggle = (key: keyof CookiePreferencesState) => {
    const newPrefs = { ...preferences, [key]: !preferences[key] }
    savePreferences(newPrefs)
  }

  const acceptAll = () => {
    savePreferences({
      analytics: true,
      functional: true,
      marketing: true,
    })
  }

  const rejectAll = () => {
    savePreferences({
      analytics: false,
      functional: false,
      marketing: false,
    })
  }

  return (
    <div className="container max-w-4xl py-16">
      {/* Header */}
      <div className="mb-12 text-center">
        <Badge variant="outline" className="mb-4">
          <Cookie className="mr-1 h-3 w-3" />
          Cookie Policy
        </Badge>
        <h1 className="mb-4 text-4xl font-bold tracking-tight">Cookie Policy</h1>
        <p className="text-muted-foreground">Last updated: December 11, 2025</p>
      </div>

      {/* Introduction */}
      <Card className="mb-8 border-border/50">
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            This Cookie Policy explains how {PLATFORM_CONFIG.name} ("we", "us", or "our") uses cookies and similar
            tracking technologies when you visit our website. We are committed to being transparent about our data
            collection practices and giving you control over your privacy preferences.
          </p>
        </CardContent>
      </Card>

      {/* What Are Cookies */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">What Are Cookies?</h2>
        <div className="space-y-4 text-muted-foreground">
          <p>
            Cookies are small text files that are stored on your device (computer, tablet, or mobile) when you visit a
            website. They are widely used to make websites work more efficiently and provide information to website
            owners.
          </p>
          <p>
            Cookies can be "persistent" or "session" cookies. Persistent cookies remain on your device after you close
            your browser, while session cookies are deleted when you close your browser.
          </p>
        </div>
      </section>

      {/* Cookie Types */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-bold">Types of Cookies We Use</h2>
        <div className="space-y-6">
          {cookieTypes.map((type) => {
            const isEnabled =
              type.required || (type.key !== "essential" && preferences[type.key as keyof CookiePreferencesState])

            return (
              <Card
                key={type.name}
                className={`border-border/50 transition-all ${isEnabled && !type.required ? "border-primary/30 bg-primary/5" : ""}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${isEnabled ? "bg-primary/20" : "bg-muted"}`}
                      >
                        <type.icon className={`h-5 w-5 ${isEnabled ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {type.name}
                          {type.required && (
                            <Badge variant="secondary" className="text-xs">
                              Required
                            </Badge>
                          )}
                          {!type.required && isEnabled && (
                            <Badge className="bg-primary/20 text-primary text-xs">
                              <Check className="mr-1 h-3 w-3" />
                              Enabled
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1">{type.description}</CardDescription>
                      </div>
                    </div>
                    {!type.required && type.key !== "essential" && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Label htmlFor={type.key} className="text-sm text-muted-foreground">
                          {preferences[type.key as keyof CookiePreferencesState] ? "Enabled" : "Disabled"}
                        </Label>
                        <Switch
                          id={type.key}
                          checked={preferences[type.key as keyof CookiePreferencesState]}
                          onCheckedChange={() => handleToggle(type.key as keyof CookiePreferencesState)}
                        />
                      </div>
                    )}
                    {type.required && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Label className="text-sm text-muted-foreground">Always On</Label>
                        <Switch checked disabled className="opacity-50" />
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="mb-3 text-sm font-medium">Cookies in this category:</h4>
                    <div className="space-y-2">
                      {type.examples.map((cookie) => (
                        <div key={cookie.name} className="flex items-center justify-between text-sm">
                          <div>
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{cookie.name}</code>
                            <span className="ml-2 text-muted-foreground">{cookie.purpose}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{cookie.duration}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* How to Control Cookies */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">How to Control Cookies</h2>
        <div className="space-y-4 text-muted-foreground">
          <p>
            You can control and manage cookies in various ways. Please note that removing or blocking cookies may impact
            your user experience and some functionality may no longer be available.
          </p>

          <h3 className="mt-6 text-lg font-semibold text-foreground">Browser Settings</h3>
          <p>Most browsers allow you to control cookies through their settings. You can set your browser to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Block all cookies</li>
            <li>Block third-party cookies</li>
            <li>Clear all cookies when you close the browser</li>
            <li>Notify you when a website wants to set a cookie</li>
          </ul>

          <h3 className="mt-6 text-lg font-semibold text-foreground">Opt-Out Links</h3>
          <p>For specific third-party cookies, you can opt out using these services:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Analytics Opt-out
              </a>
            </li>
            <li>
              <a
                href="https://www.facebook.com/help/568137493302217"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Facebook Ad Preferences
              </a>
            </li>
            <li>
              <a
                href="https://optout.aboutads.info/"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Digital Advertising Alliance Opt-out
              </a>
            </li>
          </ul>
        </div>
      </section>

      {/* Third-Party Cookies */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Third-Party Cookies</h2>
        <p className="text-muted-foreground">
          Some cookies on our website are set by third-party services that appear on our pages. We do not control these
          third-party cookies and recommend that you check the respective privacy policies of these third parties for
          more information about their cookies and how to manage them.
        </p>
      </section>

      {/* Updates */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Updates to This Policy</h2>
        <p className="text-muted-foreground">
          We may update this Cookie Policy from time to time to reflect changes in our practices or for other
          operational, legal, or regulatory reasons. We will notify you of any material changes by posting the updated
          policy on this page with a new "Last updated" date.
        </p>
      </section>

      {/* Contact */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Contact Us</h2>
        <p className="text-muted-foreground">
          If you have any questions about our use of cookies, please contact us at{" "}
          <a href={`mailto:${PLATFORM_CONFIG.supportEmail}`} className="text-primary hover:underline">
            {PLATFORM_CONFIG.supportEmail}
          </a>
        </p>
      </section>

      {/* Save Preferences CTA */}
      <Card
        className={`border-primary/20 transition-all ${saved ? "bg-green-500/10 border-green-500/30" : "bg-primary/5"}`}
      >
        <CardContent className="flex flex-col items-center p-8 text-center">
          {saved ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 mb-4">
              <Check className="h-6 w-6 text-green-500" />
            </div>
          ) : (
            <Cookie className="mb-4 h-12 w-12 text-primary" />
          )}
          <h3 className="mb-2 text-xl font-bold">{saved ? "Preferences Saved!" : "Manage Your Cookie Preferences"}</h3>
          <p className="mb-6 text-muted-foreground">
            {saved
              ? "Your cookie preferences have been saved successfully."
              : "You can update your cookie preferences at any time using the toggles above or by clicking the buttons below."}
          </p>
          <div className="flex gap-4">
            <Button variant="outline" onClick={rejectAll} disabled={saved}>
              Reject All
            </Button>
            <Button onClick={acceptAll} disabled={saved}>
              Accept All
            </Button>
          </div>
          {/* Current preferences summary */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Essential: Always On
            </Badge>
            <Badge variant={preferences.analytics ? "default" : "outline"} className="text-xs">
              Analytics: {preferences.analytics ? "On" : "Off"}
            </Badge>
            <Badge variant={preferences.functional ? "default" : "outline"} className="text-xs">
              Functional: {preferences.functional ? "On" : "Off"}
            </Badge>
            <Badge variant={preferences.marketing ? "default" : "outline"} className="text-xs">
              Marketing: {preferences.marketing ? "On" : "Off"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

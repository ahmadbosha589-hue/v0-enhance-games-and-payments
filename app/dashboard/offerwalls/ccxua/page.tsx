import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getUser, getProfile } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { OfferwallVPNGuard } from "@/components/dashboard/offerwall-vpn-guard"
import {
  ArrowLeft,
  ExternalLink,
  Lock,
  Sparkles,
  Globe2,
  Zap,
  ShieldCheck,
  Info,
} from "lucide-react"

export const metadata = {
  title: "c.cx.ua Offerwall | CryptoFaucet",
  description:
    "Earn satoshis with c.cx.ua premium offers, surveys, and tasks. Auto-translated, globally available.",
}

export const dynamic = "force-dynamic"

function resolveCcxuaKey(): string {
  return (
    process.env.CCXUA_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_CCXUA_API_KEY?.trim() ||
    ""
  )
}

function SetupRequired() {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-col items-center text-center max-w-xl mx-auto">
          <div className="p-3 rounded-2xl bg-amber-500/10 mb-4">
            <Lock className="h-8 w-8 text-amber-500" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold mb-2">Setup Required</h2>
          <p className="text-sm text-muted-foreground mb-6 text-pretty">
            The c.cx.ua offerwall is not yet configured. An administrator needs to set the
            <code className="mx-1 px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
              CCXUA_API_KEY
            </code>
            environment variable to enable this integration.
          </p>

          <div className="w-full text-left space-y-3 mb-6">
            <p className="text-sm font-semibold">Admin setup checklist</p>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>
                Register your site at{" "}
                <a
                  href="https://c.cx.ua/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  c.cx.ua
                  <ExternalLink className="h-3 w-3" />
                </a>
                {" "}and get your API & Secret keys.
              </li>
              <li>
                Set the postback URL on your c.cx.ua dashboard to:
                <code className="block mt-1 px-2 py-1.5 rounded bg-muted font-mono text-xs break-all">
                  {`${process.env.NEXT_PUBLIC_APP_URL || "https://yourdomain.com"}/api/postback/ccxua`}
                </code>
              </li>
              <li>
                Add these environment variables in your hosting platform:
                <ul className="mt-2 ml-4 space-y-1.5 text-xs">
                  <li>
                    <code className="px-1.5 py-0.5 rounded bg-muted font-mono">CCXUA_API_KEY</code>{" "}
                    <span className="text-muted-foreground">— your c.cx.ua API key</span>
                  </li>
                  <li>
                    <code className="px-1.5 py-0.5 rounded bg-muted font-mono">CCXUA_SECRET_KEY</code>{" "}
                    <span className="text-muted-foreground">— for postback signature verification</span>
                  </li>
                </ul>
              </li>
              <li>
                Recommended currency exchange rate on c.cx.ua dashboard:{" "}
                <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">100000</code>
                <span className="text-muted-foreground"> (sats per 1 USD)</span>
              </li>
            </ol>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button asChild variant="outline">
              <Link href="/dashboard/offerwalls">
                <ArrowLeft className="h-4 w-4" />
                Back to Offerwalls
              </Link>
            </Button>
            <Button asChild>
              <a
                href="https://c.cx.ua/docs/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                View c.cx.ua Docs
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OfferwallFrame({ apiKey, userId }: { apiKey: string; userId: string }) {
  const src = `https://c.cx.ua/offerwall/${encodeURIComponent(apiKey)}/${encodeURIComponent(userId)}`

  return (
    <Card className="overflow-hidden border-cyan-500/30">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 border-b bg-gradient-to-r from-cyan-500/5 via-teal-500/5 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-cyan-500/10 ring-1 ring-cyan-500/20 shrink-0">
            <Sparkles className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm sm:text-base truncate">c.cx.ua Offerwall</p>
              <Badge className="bg-gradient-to-r from-cyan-500 to-teal-500 text-white border-0 text-[10px]">
                LIVE
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              Complete offers below to earn satoshis instantly
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in new tab
          </a>
        </Button>
      </div>

      <div className="relative w-full bg-background">
        {/* Per c.cx.ua docs: allow popups so offers can open in new tabs.
            We intentionally don't add the `sandbox` attribute — it breaks
            some offer flows (redirects, JS popups). */}
        <iframe
          src={src}
          title="c.cx.ua Offerwall"
          frameBorder={0}
          allow="popups; popups-to-escape-sandbox"
          referrerPolicy="origin"
          className="w-full block"
          style={{ height: "min(80vh, 900px)", minHeight: 600, border: 0 }}
        />
      </div>
    </Card>
  )
}

function HighlightCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Globe2
  title: string
  desc: string
}) {
  return (
    <Card className="border-cyan-500/20">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 rounded-md bg-cyan-500/10 shrink-0">
            <Icon className="h-3.5 w-3.5 text-cyan-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed text-pretty">
              {desc}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default async function CcxuaPage() {
  const user = await getUser()
  if (!user) redirect("/auth/login?redirect=/dashboard/offerwalls/ccxua")

  const profile = await getProfile(user.id)
  if (!profile) redirect("/auth/login?redirect=/dashboard/offerwalls/ccxua")

  const apiKey = resolveCcxuaKey()
  const configured = apiKey.length > 0

  return (
    <div className="space-y-5 sm:space-y-6 p-4 sm:p-6">
      {/* Breadcrumb header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/dashboard/offerwalls"
            className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Offerwalls
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">c.cx.ua</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-teal-500/10 ring-1 ring-cyan-500/20 shrink-0">
              <Sparkles className="h-6 w-6 text-cyan-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">c.cx.ua</h1>
                <Badge className="bg-gradient-to-r from-cyan-500 to-teal-500 text-white border-0">
                  NEW PARTNER
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl text-pretty">
                Premium auto-translated offerwall with global CPA offers, surveys, app installs and
                short tasks. Rewards credit directly to your balance after the advertiser confirms
                completion.
              </p>
            </div>
          </div>
        </div>
      </div>

      <OfferwallVPNGuard>
        {/* Highlights */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <HighlightCard
            icon={Globe2}
            title="Global, auto-translated"
            desc="Offers served in your visitors' language with worldwide geo-coverage."
          />
          <HighlightCard
            icon={Zap}
            title="Fast crediting"
            desc="Most rewards land in your balance within 5–30 minutes of completion."
          />
          <HighlightCard
            icon={ShieldCheck}
            title="Signed postbacks"
            desc="Every conversion is verified with MD5 signature + IP allow-list."
          />
        </div>

        {/* Tips */}
        <Alert className="border-blue-500/30 bg-blue-500/5">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-xs sm:text-sm text-pretty">
            <strong>Tip:</strong> Stay on the page until the offer confirms it&apos;s complete.
            Disable adblockers/VPNs while completing offers — they often cause conversions to fail
            silently.
          </AlertDescription>
        </Alert>

        {/* The offerwall or setup-required */}
        <Suspense fallback={null}>
          {configured ? (
            <OfferwallFrame apiKey={apiKey} userId={user.id} />
          ) : (
            <SetupRequired />
          )}
        </Suspense>
      </OfferwallVPNGuard>
    </div>
  )
}

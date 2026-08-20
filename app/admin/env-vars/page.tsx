"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  Key,
  Plus,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Loader2,
  Shield,
  AlertTriangle,
  CheckCircle,
  Database,
  CreditCard,
  Globe,
  Lock,
  Link2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface EnvVar {
  key: string
  value: string
  category: "database" | "payment" | "api" | "security" | "shortlink" | "other"
  isSecret: boolean
  isSet: boolean
  description: string
}

// Environment variable configuration - comprehensive list of all env vars used in the app
const ENV_VAR_CONFIG: Omit<EnvVar, "value" | "isSet">[] = [
  // ===== DATABASE =====
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    category: "database",
    isSecret: false,
    description: "Supabase project URL",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    category: "database",
    isSecret: false,
    description: "Supabase anonymous/public key",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    category: "database",
    isSecret: true,
    description: "Supabase service role key (admin access)",
  },
  {
    key: "SUPABASE_JWT_SECRET",
    category: "database",
    isSecret: true,
    description: "Supabase JWT secret for token verification",
  },
  {
    key: "KV_REST_API_URL",
    category: "database",
    isSecret: false,
    description: "Vercel KV / Upstash Redis REST URL",
  },
  {
    key: "KV_REST_API_TOKEN",
    category: "database",
    isSecret: true,
    description: "Vercel KV / Upstash Redis REST Token",
  },

  // ===== PAYMENT =====
  {
    key: "FAUCETPAY_API_KEY",
    category: "payment",
    isSecret: true,
    description: "FaucetPay API key for crypto withdrawals",
  },
  {
    key: "CCPAYMENT_APP_ID",
    category: "payment",
    isSecret: false,
    description: "CCPayment App ID for deposits",
  },
  {
    key: "CCPAYMENT_APP_SECRET",
    category: "payment",
    isSecret: true,
    description: "CCPayment App Secret for v2 HMAC signing",
  },
  {
    key: "CCPAYMENT_USD_FIAT_ID",
    category: "payment",
    isSecret: false,
    description: "CCPayment fiat ID for USD invoice pricing (default 1033)",
  },

  // ===== APP CONFIG =====
  {
    key: "NEXT_PUBLIC_APP_URL",
    category: "other",
    isSecret: false,
    description: "Public app URL (e.g., https://faucero.com)",
  },
  {
    key: "NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL",
    category: "other",
    isSecret: false,
    description: "OAuth redirect URL for development",
  },

  // ===== OFFERWALL PUBLIC KEYS =====
  {
    key: "CCXUA_API_KEY",
    category: "api",
    isSecret: true,
    description: "c.cx.ua API key (required for offerwall URL)",
  },
  {
    key: "CCXUA_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "c.cx.ua secret key for postback signature verification",
  },
  {
    key: "NEXT_PUBLIC_CPX_APP_ID",
    category: "api",
    isSecret: false,
    description: "CPX Research App ID",
  },
  {
    key: "NEXT_PUBLIC_BITLABS_TOKEN",
    category: "api",
    isSecret: false,
    description: "BitLabs API Token",
  },
  {
    key: "NEXT_PUBLIC_LOOTABLY_PLACEMENT_ID",
    category: "api",
    isSecret: false,
    description: "Lootably Placement ID",
  },
  {
    key: "NEXT_PUBLIC_ADGATE_WALL_CODE",
    category: "api",
    isSecret: false,
    description: "AdGate Media Wall Code",
  },
  {
    key: "NEXT_PUBLIC_TOROX_PUB_ID",
    category: "api",
    isSecret: false,
    description: "Torox Publisher ID",
  },
  {
    key: "NEXT_PUBLIC_TIMEWALL_KEY",
    category: "api",
    isSecret: false,
    description: "Timewall API Key",
  },
  {
    key: "NEXT_PUBLIC_AYET_ADSLOT",
    category: "api",
    isSecret: false,
    description: "ayeT-Studios Ad Slot ID",
  },
  {
    key: "NEXT_PUBLIC_ADGEM_PLAYER_ID",
    category: "api",
    isSecret: false,
    description: "AdGem Player ID",
  },

  // ===== OFFERWALL SECRET KEYS (for postback verification) =====
  {
    key: "CPX_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "CPX Research postback secret key",
  },
  {
    key: "TOROX_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "Torox postback secret key",
  },
  {
    key: "LOOTABLY_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "Lootably postback secret key",
  },
  {
    key: "ADGATE_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "AdGate Media postback secret key",
  },
  {
    key: "BITLABS_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "BitLabs postback secret key",
  },
  {
    key: "TIMEWALL_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "Timewall postback secret key",
  },
  {
    key: "AYET_STUDIOS_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "ayeT-Studios postback secret key",
  },
  {
    key: "MM_WALL_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "MM Wall postback secret key",
  },
  {
    key: "OFFERWALLME_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "Offerwall.me postback secret key",
  },
  {
    key: "BICOTASKS_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "BicoTasks postback secret key",
  },
  {
    key: "ADSCEND_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "Adscend Media postback secret key",
  },
  {
    key: "HANG_MY_ADS_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "Hang My Ads postback secret key",
  },
  {
    key: "NOTIK_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "Notik postback secret key",
  },
  {
    key: "MONLIX_APP_ID",
    category: "api",
    isSecret: false,
    description: "Monlix App ID",
  },
  {
    key: "MONLIX_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "Monlix postback secret key",
  },
  {
    key: "HIDEOUT_SECRET_KEY",
    category: "api",
    isSecret: true,
    description: "Hideout.tv postback secret key",
  },

  // ===== CRON JOB SECURITY =====
  {
    key: "CRON_SECRET",
    category: "security",
    isSecret: true,
    description: "Secret key for cron job authentication",
  },

  // ===== SHORTLINK PROVIDERS =====
  // The shortener library auto-falls-back through any configured provider,
  // so admins can add as many or as few keys as they have. Each provider
  // shows as "Configured" when its API key env var is set on Vercel.
  {
    key: "SHORTLINK_PROVIDER",
    category: "shortlink",
    isSecret: false,
    description: "Active provider (shrinkme | shrinkearn | exeio | fclc | gplinks | ouoio | linkvertise | shortest | shareus | stfly | cuty | adfocus | linkpays | clk)",
  },
  { key: "SHRINKME_API_KEY",    category: "shortlink", isSecret: true, description: "ShrinkMe.io API Key — highest-paying URL shortener (up to $22 CPM)" },
  { key: "SHRINKEARN_API_KEY",  category: "shortlink", isSecret: true, description: "ShrinkEarn API Key — trusted shortener since 2018 (up to $20 CPM)" },
  { key: "EXEIO_API_KEY",       category: "shortlink", isSecret: true, description: "Exe.io API Key — Bitcoin payouts available (up to $15 CPM)" },
  { key: "FCLC_API_KEY",        category: "shortlink", isSecret: true, description: "FC.LC API Key — fast redirect network" },
  { key: "GPLINKS_API_KEY",     category: "shortlink", isSecret: true, description: "GPLinks.in API Key — India-friendly shortener" },
  { key: "OUOIO_API_KEY",       category: "shortlink", isSecret: true, description: "Ouo.io API Key — fast & reliable redirects (up to $7 CPM)" },
  { key: "LINKVERTISE_API_KEY", category: "shortlink", isSecret: true, description: "Linkvertise API Token — premium rewards platform (up to $5 CPM)" },
  { key: "SHORTEST_API_KEY",    category: "shortlink", isSecret: true, description: "Shorte.st Public API Token — veteran shortlink network" },
  { key: "SHAREUS_API_KEY",     category: "shortlink", isSecret: true, description: "ShareUs.io API Key — crypto-friendly (up to $10 CPM)" },
  { key: "STFLY_API_KEY",       category: "shortlink", isSecret: true, description: "Stfly.io API Key — free, fast shortener (up to $9 CPM)" },
  { key: "CUTY_API_KEY",        category: "shortlink", isSecret: true, description: "Cuty.io API Key — multi-tier earnings (up to $14 CPM)" },
  { key: "ADFOCUS_API_KEY",     category: "shortlink", isSecret: true, description: "AdFoc.us API Key — daily payouts shortener" },
  { key: "LINKPAYS_API_KEY",    category: "shortlink", isSecret: true, description: "LinkPays.in API Key — worldwide audience (up to $12 CPM)" },
  { key: "CLK_API_KEY",         category: "shortlink", isSecret: true, description: "Clk.sh API Key — reliable, established network (up to $11 CPM)" },

  // ===== SECURITY - VPN/PROXY DETECTION =====
  {
    key: "IP_API_KEY",
    category: "security",
    isSecret: true,
    description: "IP-API.com API Key for geolocation",
  },
  {
    key: "VPNAPI_KEY",
    category: "security",
    isSecret: true,
    description: "VPNAPI.io Key for VPN detection",
  },
  {
    key: "IPQUALITYSCORE_API_KEY",
    category: "security",
    isSecret: true,
    description: "IPQualityScore API Key for fraud detection",
  },
  {
    key: "PROXYCHECK_API_KEY",
    category: "security",
    isSecret: true,
    description: "ProxyCheck.io API Key",
  },
  {
    key: "GETIPINTEL_EMAIL",
    category: "security",
    isSecret: false,
    description: "GetIPIntel contact email",
  },
  {
    key: "IPHUB_API_KEY",
    category: "security",
    isSecret: true,
    description: "IPHub API Key",
  },
  {
    key: "IP2LOCATION_API_KEY",
    category: "security",
    isSecret: true,
    description: "IP2Location API Key",
  },
  {
    key: "ABUSEIPDB_API_KEY",
    category: "security",
    isSecret: true,
    description: "AbuseIPDB API Key",
  },
  {
    key: "SHODAN_API_KEY",
    category: "security",
    isSecret: true,
    description: "Shodan API Key",
  },
  {
    key: "IPINFO_TOKEN",
    category: "security",
    isSecret: true,
    description: "IPInfo.io Token",
  },
  {
    key: "BIGDATACLOUD_KEY",
    category: "security",
    isSecret: true,
    description: "BigDataCloud API Key",
  },
  {
    key: "SCAMALYTICS_API_KEY",
    category: "security",
    isSecret: true,
    description: "Scamalytics API Key",
  },
  {
    key: "FRAUDGUARD_USERNAME",
    category: "security",
    isSecret: false,
    description: "FraudGuard Username",
  },
  {
    key: "FRAUDGUARD_PASSWORD",
    category: "security",
    isSecret: true,
    description: "FraudGuard Password",
  },
  {
    key: "IP2PROXY_API_KEY",
    category: "security",
    isSecret: true,
    description: "IP2Proxy API Key",
  },
  {
    key: "DBIP_API_KEY",
    category: "security",
    isSecret: true,
    description: "DB-IP API Key",
  },
  {
    key: "SPUR_TOKEN",
    category: "security",
    isSecret: true,
    description: "Spur.us Token for VPN detection",
  },

  // ===== SECURITY - CAPTCHA & TOKENS =====
  {
    key: "TURNSTILE_SECRET_KEY",
    category: "security",
    isSecret: true,
    description: "Cloudflare Turnstile secret key",
  },
  {
    key: "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    category: "security",
    isSecret: false,
    description: "Cloudflare Turnstile site key",
  },
  {
    key: "NEXT_PUBLIC_HCAPTCHA_SITE_KEY",
    category: "security",
    isSecret: false,
    description: "hCaptcha site key",
  },
  {
    key: "CSRF_SECRET",
    category: "security",
    isSecret: true,
    description: "CSRF protection secret",
  },
  {
    key: "CHALLENGE_SECRET",
    category: "security",
    isSecret: true,
    description: "Challenge verification secret",
  },
  {
    key: "BALANCE_INTEGRITY_SECRET",
    category: "security",
    isSecret: true,
    description: "Balance integrity verification secret",
  },
  {
    key: "IP_HASH_SALT",
    category: "security",
    isSecret: true,
    description: "Salt for IP address hashing",
  },

  // ===== EMAIL =====
  {
    key: "RESEND_API_KEY",
    category: "api",
    isSecret: true,
    description: "Resend API Key for email sending",
  },
  {
    key: "EMAIL_FROM",
    category: "api",
    isSecret: false,
    description: "Default from email address",
  },
  {
    key: "SUPPORT_EMAIL",
    category: "api",
    isSecret: false,
    description: "Support email address",
  },
]

const categoryConfig = {
  database: {
    label: "Database",
    icon: Database,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  payment: {
    label: "Payment",
    icon: CreditCard,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  api: {
    label: "API Keys",
    icon: Globe,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  shortlink: {
    label: "Shortlink Providers",
    icon: Link2,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
  security: {
    label: "Security",
    icon: Shield,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  other: {
    label: "Other",
    icon: Key,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
  },
}

export default function AdminEnvVarsPage() {
  const [envVars, setEnvVars] = useState<EnvVar[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  useEffect(() => {
    checkEnvVars()
  }, [])

  const checkEnvVars = async () => {
    setIsLoading(true)
    try {
      // cache-bust the request so newly added Vercel env vars are visible
      // immediately when the admin clicks "Refresh".
      const response = await fetch(`/api/admin/env-vars/check?t=${Date.now()}`, {
        cache: "no-store",
      })
      if (response.ok) {
        const data = await response.json()
        setEnvVars(data.envVars)
      } else {
        // If API doesn't exist yet, use client-side check for public vars
        const vars: EnvVar[] = ENV_VAR_CONFIG.map((config) => ({
          ...config,
          value: "",
          isSet: config.key.startsWith("NEXT_PUBLIC_")
            ? !!process.env[config.key]
            : false, // Can't check server vars from client
        }))
        setEnvVars(vars)
      }
    } catch {
      // Fallback to config-based display
      const vars: EnvVar[] = ENV_VAR_CONFIG.map((config) => ({
        ...config,
        value: "",
        isSet: false,
      }))
      setEnvVars(vars)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleShowSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  const maskValue = (value: string) => {
    if (!value) return "Not set"
    if (value.length <= 8) return "••••••••"
    return value.substring(0, 4) + "••••••••" + value.substring(value.length - 4)
  }

  // Group env vars by category
  const groupedVars = envVars.reduce(
    (acc, envVar) => {
      if (!acc[envVar.category]) {
        acc[envVar.category] = []
      }
      acc[envVar.category].push(envVar)
      return acc
    },
    {} as Record<string, EnvVar[]>
  )

  const totalVars = envVars.length
  const setVars = envVars.filter((v) => v.isSet).length
  const missingCritical = envVars.filter(
    (v) => !v.isSet && ["SUPABASE_SERVICE_ROLE_KEY", "FAUCETPAY_API_KEY"].includes(v.key)
  ).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Key className="h-6 w-6 text-primary" />
            Environment Variables
          </h1>
          <p className="text-muted-foreground">
            Manage API keys and configuration settings
          </p>
        </div>
        <Button variant="outline" onClick={checkEnvVars} disabled={isLoading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Key className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Variables</p>
                <p className="text-lg font-bold">{totalVars}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Configured</p>
                <p className="text-lg font-bold">{setVars}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Missing</p>
                <p className="text-lg font-bold">{totalVars - setVars}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", missingCritical > 0 ? "bg-red-500/10" : "bg-green-500/10")}>
                <Shield className={cn("h-5 w-5", missingCritical > 0 ? "text-red-500" : "text-green-500")} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Critical Missing</p>
                <p className="text-lg font-bold">{missingCritical}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Important Notice */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-600 dark:text-amber-400">
                Environment Variables are Read-Only
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Environment variables must be configured in your deployment platform (Vercel, etc.) or in your local .env file.
                This page shows which variables are configured and which are missing.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Environment Variables by Category */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedVars).map(([category, vars]) => {
          const config = categoryConfig[category as keyof typeof categoryConfig]
          const CategoryIcon = config?.icon || Key

          return (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className={cn("p-1.5 rounded-md", config?.bgColor)}>
                    <CategoryIcon className={cn("h-4 w-4", config?.color)} />
                  </div>
                  {config?.label || category}
                </CardTitle>
                <CardDescription>
                  {vars.filter((v) => v.isSet).length} of {vars.length} configured
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variable</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vars.map((envVar) => (
                        <TableRow key={envVar.key}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                {envVar.key}
                              </code>
                              {envVar.isSecret && (
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {envVar.description}
                          </TableCell>
                          <TableCell>
                            {envVar.isSet ? (
                              <Badge className="bg-green-500/10 text-green-500 border-green-500/30">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Configured
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Missing
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(envVar.key)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )
        })
      )}

      {/* Setup Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup Guide</CardTitle>
          <CardDescription>How to configure environment variables</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">For Vercel Deployment:</h4>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>Go to your Vercel project dashboard</li>
              <li>Navigate to Settings → Environment Variables</li>
              <li>Add each variable with its corresponding value</li>
              <li>Redeploy your application</li>
            </ol>
          </div>
          <Separator />
          <div className="space-y-2">
            <h4 className="font-medium text-sm">For Local Development:</h4>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>Create a `.env.local` file in your project root</li>
              <li>Add variables in the format: `KEY=value`</li>
              <li>Restart your development server</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

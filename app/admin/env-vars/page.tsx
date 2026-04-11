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
} from "lucide-react"
import { cn } from "@/lib/utils"

interface EnvVar {
  key: string
  value: string
  category: "database" | "payment" | "api" | "security" | "other"
  isSecret: boolean
  isSet: boolean
  description: string
}

// Environment variable configuration
const ENV_VAR_CONFIG: Omit<EnvVar, "value" | "isSet">[] = [
  // Database
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
  // Payment
  {
    key: "FAUCETPAY_API_KEY",
    category: "payment",
    isSecret: true,
    description: "FaucetPay API key for withdrawals",
  },
  // API Keys
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
  // Security
  {
    key: "UPSTASH_REDIS_REST_URL",
    category: "security",
    isSecret: false,
    description: "Upstash Redis REST URL for rate limiting",
  },
  {
    key: "UPSTASH_REDIS_REST_TOKEN",
    category: "security",
    isSecret: true,
    description: "Upstash Redis REST Token",
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
      const response = await fetch("/api/admin/env-vars/check")
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

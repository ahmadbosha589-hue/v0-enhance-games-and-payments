"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
  Loader2, Save, Trash2, CheckCircle2, AlertCircle,
  Eye, EyeOff, RefreshCw, Shield, Info, Lock, Key, Settings
} from "lucide-react"

interface EnvVarConfig {
  key: string
  label: string
  description: string
  category: "ads" | "payments" | "security" | "api"
  isSet: boolean
  lastUpdated?: string
}

const ENV_VAR_CONFIGS: EnvVarConfig[] = [
  // Ad Networks
  { key: "GOOGLE_ADSENSE_ID", label: "Google AdSense ID", description: "Publisher ID for Google AdSense", category: "ads", isSet: false },
  { key: "COINTRAFFIC_ZONE_ID", label: "Cointraffic Zone ID", description: "Zone ID for Cointraffic ads", category: "ads", isSet: false },
  { key: "MEDIANET_ID", label: "Media.net ID", description: "Customer ID for Media.net", category: "ads", isSet: false },
  { key: "HILLTOPADS_ID", label: "HilltopAds ID", description: "Publisher ID for HilltopAds", category: "ads", isSet: false },
  { key: "ADSTERRA_ID", label: "Adsterra ID", description: "Publisher ID for Adsterra", category: "ads", isSet: false },
  { key: "PROPELLERADS_ID", label: "PropellerAds ID", description: "Zone ID for PropellerAds", category: "ads", isSet: false },
  { key: "TRAFFICSTARS_ID", label: "TrafficStars ID", description: "Spot ID for TrafficStars", category: "ads", isSet: false },
  { key: "ADSKEEPER_ID", label: "Adskeeper ID", description: "Widget ID for Adskeeper", category: "ads", isSet: false },
  { key: "AADS_ID", label: "A-ADS ID", description: "Unit ID for A-ADS", category: "ads", isSet: false },
  { key: "COINZILLA_ZONE", label: "Coinzilla Zone", description: "Zone ID for Coinzilla", category: "ads", isSet: false },
  { key: "BITSMEDIA_ID", label: "Bitsmedia ID", description: "Publisher ID for Bitsmedia", category: "ads", isSet: false },
  { key: "BITMEDIA_ID", label: "Bitmedia ID", description: "Zone ID for Bitmedia", category: "ads", isSet: false },
  
  // Payment Processors
  { key: "FAUCETPAY_API_KEY", label: "FaucetPay API Key", description: "API key for FaucetPay withdrawals", category: "payments", isSet: false },
  { key: "CCPAYMENT_APP_ID", label: "CCPayment App ID", description: "App ID for CCPayment", category: "payments", isSet: false },
  { key: "CCPAYMENT_APP_SECRET", label: "CCPayment App Secret", description: "App Secret for CCPayment", category: "payments", isSet: false },
  { key: "CWALLET_API_KEY", label: "CWallet API Key", description: "API key for CWallet integration", category: "payments", isSet: false },
  
  // Security
  { key: "TURNSTILE_SECRET_KEY", label: "Turnstile Secret", description: "Cloudflare Turnstile secret key", category: "security", isSet: false },
  { key: "HCAPTCHA_SECRET", label: "hCaptcha Secret", description: "hCaptcha secret key", category: "security", isSet: false },
  
  // Offerwall APIs
  { key: "CPX_APP_ID", label: "CPX Research App ID", description: "App ID for CPX Research", category: "api", isSet: false },
  { key: "OFFERTORO_PUB_ID", label: "OfferToro Pub ID", description: "Publisher ID for OfferToro", category: "api", isSet: false },
  { key: "ADGATE_WALL_CODE", label: "AdGate Wall Code", description: "Wall code for AdGate Media", category: "api", isSet: false },
  { key: "LOOTABLY_PLACEMENT_ID", label: "Lootably Placement ID", description: "Placement ID for Lootably", category: "api", isSet: false },
  { key: "BITLABS_TOKEN", label: "BitLabs Token", description: "API token for BitLabs", category: "api", isSet: false },
]

const CATEGORY_INFO = {
  ads: { label: "Ad Networks", icon: Settings, color: "text-amber-500", bgColor: "bg-amber-500/10" },
  payments: { label: "Payment Processors", icon: Key, color: "text-green-500", bgColor: "bg-green-500/10" },
  security: { label: "Security", icon: Shield, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  api: { label: "Offerwall APIs", icon: Lock, color: "text-purple-500", bgColor: "bg-purple-500/10" },
}

export function EnvVarsSettings() {
  const [configs, setConfigs] = useState<EnvVarConfig[]>(ENV_VAR_CONFIGS)
  const [isLoading, setIsLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [showValue, setShowValue] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/admin/env-vars/status")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      
      setConfigs(prev => prev.map(config => ({
        ...config,
        isSet: data.configured?.includes(config.key) || false,
        lastUpdated: data.lastUpdated?.[config.key]
      })))
    } catch (error) {
      console.error("Failed to fetch env var status:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleSave = async (key: string) => {
    if (!inputValue.trim()) {
      toast.error("Please enter a value")
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch("/api/admin/env-vars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: inputValue })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save")

      toast.success(`${key} configured successfully`)
      setEditingKey(null)
      setInputValue("")
      await fetchStatus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (key: string) => {
    if (!confirm(`Are you sure you want to delete ${key}? This action cannot be undone.`)) {
      return
    }

    setIsDeleting(key)
    try {
      const res = await fetch("/api/admin/env-vars", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to delete")

      toast.success(`${key} deleted`)
      await fetchStatus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete")
    } finally {
      setIsDeleting(null)
    }
  }

  const groupedConfigs = configs.reduce((acc, config) => {
    if (!acc[config.category]) acc[config.category] = []
    acc[config.category].push(config)
    return acc
  }, {} as Record<string, EnvVarConfig[]>)

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-8 justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading configuration status...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Alert className="border-blue-500/30 bg-blue-500/5">
        <Shield className="h-4 w-4 text-blue-500" />
        <AlertTitle className="text-blue-600 dark:text-blue-400">Secure Configuration</AlertTitle>
        <AlertDescription className="text-xs sm:text-sm">
          All sensitive values are encrypted using AES-256 before storage. 
          Once configured, values cannot be viewed again - only replaced or deleted.
        </AlertDescription>
      </Alert>

      {Object.entries(groupedConfigs).map(([category, categoryConfigs]) => {
        const categoryInfo = CATEGORY_INFO[category as keyof typeof CATEGORY_INFO]
        const Icon = categoryInfo.icon

        return (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <div className={`p-1.5 rounded-lg ${categoryInfo.bgColor}`}>
                  <Icon className={`h-4 w-4 ${categoryInfo.color}`} />
                </div>
                {categoryInfo.label}
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Configure your {categoryInfo.label.toLowerCase()} credentials
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {categoryConfigs.map((config) => (
                <div 
                  key={config.key}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-muted/20"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{config.label}</span>
                      {config.isSet ? (
                        <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Configured
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Not Set
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{config.description}</p>
                    <code className="text-[10px] text-muted-foreground/70 font-mono">{config.key}</code>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {editingKey === config.key ? (
                      <>
                        <div className="relative">
                          <Input
                            type={showValue ? "text" : "password"}
                            placeholder="Enter value..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            className="pr-8 w-40 sm:w-48 h-8 text-xs font-mono"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowValue(!showValue)}
                          >
                            {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleSave(config.key)}
                          disabled={isSaving}
                          className="h-8 px-3"
                        >
                          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingKey(null); setInputValue(""); }}
                          className="h-8 px-2"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setEditingKey(config.key); setInputValue(""); setShowValue(false); }}
                          className="h-8 px-3 text-xs"
                        >
                          {config.isSet ? "Replace" : "Configure"}
                        </Button>
                        {config.isSet && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(config.key)}
                            disabled={isDeleting === config.key}
                            className="h-8 px-2 text-destructive hover:text-destructive"
                          >
                            {isDeleting === config.key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4" />
        <p>Changes take effect immediately. Some services may require a page refresh.</p>
      </div>
    </div>
  )
}

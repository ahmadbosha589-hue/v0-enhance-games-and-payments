"use client"

import { useState, useEffect, useCallback } from "react"
import { createBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
  Loader2,
  Save,
  ExternalLink,
  Info,
  CheckCircle2,
  AlertCircle,
  Settings,
  Zap,
  BookOpen,
  Eye,
  MousePointer,
  RefreshCw,
  LayoutGrid,
} from "lucide-react"

// Database schema matching interface
interface AdSetting {
  id: string
  position: string
  provider: "aads" | "coinzilla" | "bitsmedia"
  enabled: boolean
  aads_id: string | null
  coinzilla_zone: string | null
  bitsmedia_id: string | null
  bitsmedia_slot: string | null
  impressions: number
  clicks: number
  revenue_satoshis: number
  created_at: string
  updated_at: string
}

// Provider configuration
const providers = {
  aads: {
    name: "A-ADS",
    description: "Anonymous Bitcoin advertising network - No KYC required, instant BTC payouts",
    signupUrl: "https://a-ads.com",
    color: "bg-orange-500",
    textColor: "text-orange-500",
    bgLight: "bg-orange-500/10",
    fields: [
      {
        key: "aads_id",
        label: "Ad Unit ID",
        placeholder: "123456",
        required: true,
        helpText: "Find this in your A-ADS dashboard under Ad Units",
      },
    ],
  },
  coinzilla: {
    name: "CoinZilla",
    description: "Premium crypto advertising network with high CPM rates",
    signupUrl: "https://coinzilla.com",
    color: "bg-emerald-500",
    textColor: "text-emerald-500",
    bgLight: "bg-emerald-500/10",
    fields: [
      {
        key: "coinzilla_zone",
        label: "Zone ID",
        placeholder: "C-abc123def456",
        required: true,
        helpText: "Get your Zone ID from the CoinZilla publisher dashboard",
      },
    ],
  },
  bitsmedia: {
    name: "Bitmedia",
    description: "Crypto ad network with various ad formats and competitive rates",
    signupUrl: "https://bitmedia.io",
    color: "bg-purple-500",
    textColor: "text-purple-500",
    bgLight: "bg-purple-500/10",
    fields: [
      {
        key: "bitsmedia_id",
        label: "Publisher ID",
        placeholder: "bm-pub-xxxxxx",
        required: true,
        helpText: "Your Bitmedia publisher ID",
      },
      {
        key: "bitsmedia_slot",
        label: "Slot ID",
        placeholder: "bm-slot-xxxxxx",
        required: true,
        helpText: "The specific ad slot ID for this position",
      },
    ],
  },
} as const

// Position configuration
const positions = {
  header: {
    name: "Header Banner",
    description: "Top of page banner - highest visibility",
    icon: LayoutGrid,
  },
  sidebar: {
    name: "Sidebar",
    description: "Side panel ads - good for desktop users",
    icon: LayoutGrid,
  },
  content: {
    name: "In-Content",
    description: "Within main content area",
    icon: LayoutGrid,
  },
  "between-content": {
    name: "Between Content",
    description: "Between content sections",
    icon: LayoutGrid,
  },
  footer: {
    name: "Footer",
    description: "Bottom of page - always visible",
    icon: LayoutGrid,
  },
} as const

export function AdSettingsForm() {
  const [settings, setSettings] = useState<AdSetting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editedSettings, setEditedSettings] = useState<Record<string, Partial<AdSetting>>>({})

  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    // Use AbortController for clean timeout handling
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const supabase = createBrowserClient()

      if (!supabase) {
        throw new Error("Database connection not available. Please check your configuration.")
      }

      // Execute the query with proper timeout handling
      const { data, error } = await supabase
        .from("ad_settings")
        .select("*")
        .order("position", { ascending: true })
        .abortSignal(controller.signal)

      clearTimeout(timeoutId)

      if (error) {
        console.error("[v0] Supabase error:", error)
        // Check for common errors
        if (error.message?.includes("does not exist") || error.code === "42P01") {
          throw new Error("Ad settings table not found. Please run the database migration first.")
        }
        if (error.message?.includes("aborted")) {
          throw new Error("Request timed out. Please try again.")
        }
        throw new Error(error.message || "Failed to fetch ad settings from database")
      }

      if (!data || data.length === 0) {
        // No settings exist, which is fine - just show empty state
        setSettings([])
      } else {
        setSettings(data as AdSetting[])
      }

      setLoadError(null)
    } catch (error) {
      clearTimeout(timeoutId)
      const errorMessage = error instanceof Error ? error.message : "Failed to load ad settings"
      console.error("[v0] fetchSettings error:", errorMessage)
      setLoadError(errorMessage)
      toast.error("Failed to load ad settings", {
        description: errorMessage,
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleFieldChange = (id: string, field: keyof AdSetting, value: string | boolean) => {
    setEditedSettings((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }))
  }

  const saveSetting = async (id: string) => {
    const changes = editedSettings[id]
    if (!changes || Object.keys(changes).length === 0) {
      toast.info("No changes to save")
      return
    }

    setSavingId(id)
    try {
      const supabase = createBrowserClient()

      if (!supabase) {
        throw new Error("Database connection not available")
      }

      const { error } = await supabase
        .from("ad_settings")
        .update({
          ...changes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (error) {
        throw new Error(error.message || "Failed to save settings")
      }

      // Update local state
      setSettings((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)))

      // Clear edited state for this setting
      setEditedSettings((prev) => {
        const newState = { ...prev }
        delete newState[id]
        return newState
      })

      toast.success("Settings saved successfully")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to save settings"
      console.error("[v0] saveSetting error:", errorMessage)
      toast.error("Failed to save settings", {
        description: errorMessage,
      })
    } finally {
      setSavingId(null)
    }
  }

  const toggleEnabled = async (id: string, enabled: boolean) => {
    setSavingId(id)
    try {
      const supabase = createBrowserClient()

      if (!supabase) {
        throw new Error("Database connection not available")
      }

      const { error } = await supabase
        .from("ad_settings")
        .update({
          enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (error) {
        throw new Error(error.message || "Failed to update status")
      }

      setSettings((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)))

      toast.success(enabled ? "Ad position enabled" : "Ad position disabled")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update status"
      console.error("[v0] toggleEnabled error:", errorMessage)
      toast.error("Failed to update status", {
        description: errorMessage,
      })
    } finally {
      setSavingId(null)
    }
  }

  const changeProvider = async (id: string, provider: AdSetting["provider"]) => {
    setSavingId(id)
    try {
      const supabase = createBrowserClient()

      if (!supabase) {
        throw new Error("Database connection not available")
      }

      // Clear provider-specific fields when changing provider
      const { error } = await supabase
        .from("ad_settings")
        .update({
          provider,
          aads_id: null,
          coinzilla_zone: null,
          bitsmedia_id: null,
          bitsmedia_slot: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (error) {
        throw new Error(error.message || "Failed to change provider")
      }

      setSettings((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
              ...s,
              provider,
              aads_id: null,
              coinzilla_zone: null,
              bitsmedia_id: null,
              bitsmedia_slot: null,
            }
            : s,
        ),
      )

      // Clear any edited state for this setting
      setEditedSettings((prev) => {
        const newState = { ...prev }
        delete newState[id]
        return newState
      })

      toast.success(`Switched to ${providers[provider].name}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to change provider"
      console.error("[v0] changeProvider error:", errorMessage)
      toast.error("Failed to change provider", {
        description: errorMessage,
      })
    } finally {
      setSavingId(null)
    }
  }

  const getFieldValue = (setting: AdSetting, field: string): string => {
    const editedValue = editedSettings[setting.id]?.[field as keyof AdSetting]
    if (editedValue !== undefined) {
      return String(editedValue)
    }
    const value = setting[field as keyof AdSetting]
    return value !== null && value !== undefined ? String(value) : ""
  }

  const hasUnsavedChanges = (id: string): boolean => {
    const changes = editedSettings[id]
    return !!changes && Object.keys(changes).length > 0
  }

  const isConfigured = (setting: AdSetting): boolean => {
    const providerConfig = providers[setting.provider]
    return providerConfig.fields.every((field) => {
      const value = setting[field.key as keyof AdSetting]
      return value !== null && value !== undefined && String(value).trim() !== ""
    })
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading ad settings...</p>
      </div>
    )
  }

  // Error state
  if (loadError) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to Load Ad Settings</AlertTitle>
          <AlertDescription className="mt-2">
            <p>{loadError}</p>
            <p className="mt-2 text-sm">This could be due to:</p>
            <ul className="list-disc list-inside mt-1 text-sm space-y-1">
              <li>Database connection issues</li>
              <li>Missing database tables (run the ad_settings migration)</li>
              <li>Insufficient permissions</li>
            </ul>
          </AlertDescription>
        </Alert>
        <Button onClick={fetchSettings} variant="outline" className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    )
  }

  // Empty state
  if (settings.length === 0) {
    return (
      <div className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No Ad Positions Found</AlertTitle>
          <AlertDescription className="mt-2">
            <p>The ad_settings table exists but has no entries.</p>
            <p className="mt-2 text-sm">Run the database migration script to create default ad positions:</p>
            <code className="block mt-2 p-2 bg-muted rounded text-xs">scripts/023_create_ad_settings_table.sql</code>
          </AlertDescription>
        </Alert>
        <Button onClick={fetchSettings} variant="outline" className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Quick Start Guide */}
      <Alert className="border-primary/20 bg-primary/5">
        <BookOpen className="h-4 w-4" />
        <AlertTitle>Quick Start Guide</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p className="text-sm">Configure ads for each position on your faucet:</p>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-2">
            <li>Choose an ad provider for each position</li>
            <li>Sign up on the provider's website and create ad units</li>
            <li>Copy your ad IDs and paste them in the fields below</li>
            <li>Toggle "Enabled" to activate ads for that position</li>
          </ol>
        </AlertDescription>
      </Alert>

      {/* Summary */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Ad Positions</h3>
          <p className="text-sm text-muted-foreground">
            {settings.length} position{settings.length !== 1 ? "s" : ""} configured,{" "}
            {settings.filter((s) => s.enabled).length} active
          </p>
        </div>
        <Button onClick={fetchSettings} variant="outline" size="sm" className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Ad Position List */}
      <Accordion type="multiple" className="space-y-3">
        {settings.map((setting) => {
          const providerConfig = providers[setting.provider]
          const positionConfig = positions[setting.position as keyof typeof positions]
          const configured = isConfigured(setting)
          const unsaved = hasUnsavedChanges(setting.id)

          return (
            <AccordionItem
              key={setting.id}
              value={setting.id}
              className="border rounded-lg px-4 data-[state=open]:bg-muted/20"
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-3 h-3 rounded-full ${providerConfig.color}`} />
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{positionConfig?.name || setting.position}</span>
                      <Badge variant="outline" className="text-xs">
                        {providerConfig.name}
                      </Badge>
                      <Badge variant={setting.enabled ? "default" : "secondary"} className="text-xs">
                        {setting.enabled ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Active
                          </>
                        ) : (
                          "Disabled"
                        )}
                      </Badge>
                      {!configured && (
                        <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Needs Setup
                        </Badge>
                      )}
                      {unsaved && (
                        <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                          Unsaved Changes
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {positionConfig?.description || `Ad position: ${setting.position}`}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="pb-4">
                <div className="space-y-4 pt-2">
                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Impressions</p>
                        <p className="font-semibold">{setting.impressions.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                      <MousePointer className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Clicks</p>
                        <p className="font-semibold">{setting.clicks.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">CTR</p>
                        <p className="font-semibold">
                          {setting.impressions > 0 ? ((setting.clicks / setting.impressions) * 100).toFixed(2) : "0.00"}
                          %
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Enable/Disable Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Zap className={`h-5 w-5 ${setting.enabled ? "text-green-500" : "text-muted-foreground"}`} />
                      <div>
                        <Label htmlFor={`enable-${setting.id}`} className="font-medium">
                          Enable Ads
                        </Label>
                        <p className="text-xs text-muted-foreground">Toggle to show ads in this position</p>
                      </div>
                    </div>
                    <Switch
                      id={`enable-${setting.id}`}
                      checked={setting.enabled}
                      onCheckedChange={(enabled) => toggleEnabled(setting.id, enabled)}
                      disabled={savingId === setting.id}
                    />
                  </div>

                  <Separator />

                  {/* Provider Selection */}
                  <div className="space-y-2">
                    <Label>Ad Provider</Label>
                    <Select
                      value={setting.provider}
                      onValueChange={(value) => changeProvider(setting.id, value as AdSetting["provider"])}
                      disabled={savingId === setting.id}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(providers).map(([key, provider]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${provider.color}`} />
                              {provider.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{providerConfig.description}</p>
                    <a
                      href={providerConfig.signupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Sign up at {providerConfig.name}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <Separator />

                  {/* Provider-specific fields */}
                  <div className="space-y-4">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      {providerConfig.name} Configuration
                    </Label>

                    {providerConfig.fields.map((field) => (
                      <div key={field.key} className="space-y-1">
                        <Label htmlFor={`${setting.id}-${field.key}`} className="text-sm">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        <Input
                          id={`${setting.id}-${field.key}`}
                          placeholder={field.placeholder}
                          value={getFieldValue(setting, field.key)}
                          onChange={(e) => handleFieldChange(setting.id, field.key as keyof AdSetting, e.target.value)}
                          disabled={savingId === setting.id}
                        />
                        <p className="text-xs text-muted-foreground">{field.helpText}</p>
                      </div>
                    ))}
                  </div>

                  {/* Save Button */}
                  {unsaved && (
                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={() => saveSetting(setting.id)}
                        disabled={savingId === setting.id}
                        className="gap-2"
                      >
                        {savingId === setting.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Save Changes
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}

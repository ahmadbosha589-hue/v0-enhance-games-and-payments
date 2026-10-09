"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Megaphone,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Settings2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Shield,
  Lock,
  ExternalLink,
  DollarSign,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getNetwork } from "@/lib/ads/registry"

interface AdNetwork {
  id: string
  name: string
  description: string
  status: "configured" | "not_configured"
  enabled: boolean
  fields: {
    key: string
    label: string
    type: "text" | "password" | "number"
    placeholder?: string
    required?: boolean
    helpText?: string
  }[]
  website: string
  revenueType: "CPM" | "CPC" | "CPA" | "Rewarded"
  supportedFormats: string[]
}

const AD_NETWORKS: AdNetwork[] = [
  {
    id: "cointraffic",
    name: "Cointraffic",
    description: "Premium crypto advertising network",
    status: "not_configured",
    enabled: false,
    fields: [
      { key: "COINTRAFFIC_ZONE_ID", label: "Zone ID", type: "text", placeholder: "ct-XXXXXXXX", required: true },
      { key: "COINTRAFFIC_BANNER_ID", label: "Banner ID", type: "text", placeholder: "banner_123" },
    ],
    website: "https://cointraffic.io",
    revenueType: "CPM",
    supportedFormats: ["Banner", "Native", "Pop-under"],
  },
  {
    id: "medianet",
    name: "Media.net",
    description: "Yahoo! Bing Network contextual ad provider",
    status: "not_configured",
    enabled: false,
    fields: [
      { key: "MEDIANET_CUSTOMER_ID", label: "Customer ID", type: "text", placeholder: "8CUXXXXXXX", required: true },
      { key: "MEDIANET_WIDGET_ID", label: "Widget ID", type: "text", placeholder: "123456", required: true },
    ],
    website: "https://media.net",
    revenueType: "CPC",
    supportedFormats: ["Display", "Native", "In-content"],
  },
  {
    id: "hilltopads",
    name: "HilltopAds",
    description: "High-performance ad network with anti-adblock",
    status: "not_configured",
    enabled: false,
    fields: [
      { key: "HILLTOPADS_ZONE_ID", label: "Zone ID", type: "text", placeholder: "12345678", required: true },
      { key: "HILLTOPADS_SUBID", label: "Sub ID", type: "text", placeholder: "optional_subid" },
    ],
    website: "https://hilltopads.com",
    revenueType: "CPM",
    supportedFormats: ["Banner", "Pop-under", "In-page Push", "Video"],
  },
  {
    id: "adsterra",
    name: "Adsterra",
    description: "Global advertising network with multiple ad formats",
    status: "not_configured",
    enabled: false,
    fields: [
      { key: "ADSTERRA_BANNER_KEY", label: "Banner Key", type: "text", placeholder: "atk_XXXXXX", required: true },
      { key: "ADSTERRA_NATIVE_KEY", label: "Native Key", type: "text", placeholder: "atk_native_XXX" },
      { key: "ADSTERRA_SOCIAL_BAR_KEY", label: "Social Bar Key", type: "text", placeholder: "atk_social_XXX" },
    ],
    website: "https://adsterra.com",
    revenueType: "CPM",
    supportedFormats: ["Banner", "Native", "Social Bar", "Popunder"],
  },
  {
    id: "propellerads",
    name: "PropellerAds",
    description: "Multi-format advertising platform",
    status: "not_configured",
    enabled: false,
    fields: [
      { key: "PROPELLERADS_ZONE_ID", label: "Zone ID", type: "text", placeholder: "12345678", required: true },
      { key: "PROPELLERADS_PUSH_ID", label: "Push Zone ID", type: "text", placeholder: "push_123" },
    ],
    website: "https://propellerads.com",
    revenueType: "CPM",
    supportedFormats: ["Push", "Onclick", "Interstitial", "In-page Push"],
  },
  {
    id: "trafficstars",
    name: "TrafficStars",
    description: "Premium self-serve ad network",
    status: "not_configured",
    enabled: false,
    fields: [
      { key: "TRAFFICSTARS_SPOT_ID", label: "Spot ID", type: "text", placeholder: "spot_XXXXX", required: true },
      { key: "TRAFFICSTARS_API_KEY", label: "API Key", type: "password", placeholder: "Your API key" },
    ],
    website: "https://trafficstars.com",
    revenueType: "CPM",
    supportedFormats: ["Banner", "Native", "Video", "Push"],
  },
  {
    id: "adskeeper",
    name: "AdsKeeper",
    description: "Native advertising recommendations platform",
    status: "not_configured",
    enabled: false,
    fields: [
      { key: "ADSKEEPER_WIDGET_ID", label: "Widget ID", type: "text", placeholder: "widget_123", required: true },
      { key: "ADSKEEPER_SITE_ID", label: "Site ID", type: "text", placeholder: "site_456", required: true },
    ],
    website: "https://adskeeper.com",
    revenueType: "CPC",
    supportedFormats: ["Native", "Widget", "In-feed"],
  },
  {
    id: "a_ads",
    name: "A-ADS",
    description: "Anonymous bitcoin advertising network",
    status: "not_configured",
    enabled: false,
    fields: [
      { key: "A_ADS_UNIT_ID", label: "Ad Unit ID", type: "text", placeholder: "123456", required: true },
    ],
    website: "https://a-ads.com",
    revenueType: "CPM",
    supportedFormats: ["Banner"],
  },
  {
    id: "coinzilla",
    name: "Coinzilla",
    description: "Crypto-focused advertising network",
    status: "not_configured",
    enabled: false,
    fields: [
      { key: "COINZILLA_ZONE_ID", label: "Zone ID", type: "text", placeholder: "zone_XXXXX", required: true },
    ],
    website: "https://coinzilla.com",
    revenueType: "CPM",
    supportedFormats: ["Banner", "Native", "Header"],
  },
  {
    id: "bitmedia",
    name: "Bitmedia",
    description: "Bitcoin and crypto advertising platform",
    status: "not_configured",
    enabled: false,
    fields: [
      { key: "BITMEDIA_ZONE_ID", label: "Zone ID", type: "text", placeholder: "bm_zone_123", required: true },
    ],
    website: "https://bitmedia.io",
    revenueType: "CPM",
    supportedFormats: ["Banner", "Native", "Rich Media"],
  },
  {
    id: "mellowads",
    name: "MellowAds",
    description: "Simple bitcoin advertising",
    status: "not_configured",
    enabled: false,
    fields: [
      { key: "MELLOWADS_AD_ID", label: "Ad ID", type: "text", placeholder: "12345", required: true },
    ],
    website: "https://mellowads.com",
    revenueType: "CPM",
    supportedFormats: ["Banner"],
  },
]

interface AdNetworkCardProps {
  network: AdNetwork
  savedConfig: Record<string, string>
  onSave: (networkId: string, config: Record<string, string>, enabled: boolean) => Promise<void>
  onDelete: (networkId: string) => Promise<void>
}

function AdNetworkCard({ network, savedConfig, onSave, onDelete }: AdNetworkCardProps) {
  const [config, setConfig] = useState<Record<string, string>>(savedConfig || {})
  const [enabled, setEnabled] = useState(network.enabled)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()

  const isConfigured = Object.keys(savedConfig || {}).length > 0
  const hasRequiredFields = network.fields
    .filter(f => f.required)
    .every(f => config[f.key]?.trim())

  const handleSave = async () => {
    if (!hasRequiredFields) {
      toast({
        title: "Missing Required Fields",
        description: "Please fill in all required fields before saving.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      await onSave(network.id, config, enabled)
      const registryId = network.id === "a_ads" ? "a-ads" : network.id
      const rendersLive = getNetwork(registryId)?.enabled === true
      toast({
        title: rendersLive ? "Configuration Saved — Ad Goes Live" : "Configuration Saved",
        description: rendersLive
          ? `${network.name} has been configured. The ad appears on public pages for visitors with marketing consent within ~5 minutes (config cache: s-maxage=300).`
          : `${network.name} credentials stored, but this network's ad tag is not verified yet — it will not render until the tag is implemented. The "Tag verification pending" badge stays until then.`,
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(network.id)
      setConfig({})
      setEnabled(false)
      toast({
        title: "Configuration Deleted",
        description: `${network.name} configuration has been removed.`,
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete configuration.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Card className={enabled && isConfigured ? "border-green-500/30 bg-green-500/5" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{network.name}</CardTitle>
              {/* Honest per-network render status from the canonical registry.
                  A network whose publisher tag is not implemented/verified
                  cannot render no matter what credentials are saved — say so
                  on the card instead of letting the switch imply otherwise. */}
              {(() => {
                const registryId = network.id === "a_ads" ? "a-ads" : network.id
                const registryNetwork = getNetwork(registryId)
                if (registryNetwork?.enabled) {
                  return (
                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Renders live
                    </Badge>
                  )
                }
                return (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Tag verification pending
                  </Badge>
                )
              })()}
              <Badge variant="secondary" className="text-[10px]">
                {network.revenueType}
              </Badge>
            </div>
            <CardDescription className="text-xs">{network.description}</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              asChild
            >
              <a href={network.website} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={!isConfigured}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Supported formats */}
        <div className="flex flex-wrap gap-1">
          {network.supportedFormats.map((format) => (
            <Badge key={format} variant="outline" className="text-[10px] py-0">
              {format}
            </Badge>
          ))}
        </div>

        {/* Configuration fields */}
        {isConfigured ? (
          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              <span>Configuration is encrypted and secure</span>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete Configuration
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {network.name} Configuration?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all saved credentials for this ad network. You will need to reconfigure it to use it again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="space-y-3">
            {network.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  {field.label}
                  {field.required && <span className="text-destructive">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    type={
                      field.type === "password" && !showSecrets[field.key]
                        ? "password"
                        : "text"
                    }
                    placeholder={field.placeholder}
                    value={config[field.key] || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="text-sm pr-10"
                  />
                  {field.type === "password" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() =>
                        setShowSecrets((prev) => ({
                          ...prev,
                          [field.key]: !prev[field.key],
                        }))
                      }
                    >
                      {showSecrets[field.key] ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
                {field.helpText && (
                  <p className="text-[10px] text-muted-foreground">{field.helpText}</p>
                )}
              </div>
            ))}
            <Button
              onClick={handleSave}
              disabled={!hasRequiredFields || isSaving}
              className="w-full"
              size="sm"
            >
              {isSaving ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Configuration
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface AdNetworkSettingsProps {
  initialConfigs: Record<string, { config: Record<string, string>; enabled: boolean }>
}

export function AdNetworkSettings({ initialConfigs }: AdNetworkSettingsProps) {
  const [configs, setConfigs] = useState(initialConfigs)

  const handleSave = async (networkId: string, config: Record<string, string>, enabled: boolean) => {
    const response = await fetch("/api/admin/ad-networks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ networkId, config, enabled }),
    })

    if (!response.ok) throw new Error("Failed to save")

    setConfigs(prev => ({
      ...prev,
      [networkId]: { config, enabled }
    }))
  }

  const handleDelete = async (networkId: string) => {
    const response = await fetch(`/api/admin/ad-networks?networkId=${networkId}`, {
      method: "DELETE",
    })

    if (!response.ok) throw new Error("Failed to delete")

    setConfigs(prev => {
      const newConfigs = { ...prev }
      delete newConfigs[networkId]
      return newConfigs
    })
  }

  const configuredCount = Object.keys(configs).length
  const enabledCount = Object.values(configs).filter(c => c.enabled).length

  return (
    <div className="space-y-6">
      {/* Stats overview */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Megaphone className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{AD_NETWORKS.length}</p>
                <p className="text-xs text-muted-foreground">Total Networks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{configuredCount}</p>
                <p className="text-xs text-muted-foreground">Configured</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Settings2 className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{enabledCount}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <DollarSign className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">12</p>
                <p className="text-xs text-muted-foreground">Ad Formats</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security notice */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Secure Configuration</p>
              <p className="text-xs text-muted-foreground">
                All API keys and credentials are encrypted using AES-256 encryption before storage.
                Once configured, credentials cannot be viewed again for security reasons.
                To update credentials, delete the existing configuration and reconfigure.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Network tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All ({AD_NETWORKS.length})</TabsTrigger>
          <TabsTrigger value="crypto">Crypto ({AD_NETWORKS.filter(n => ["cointraffic", "a_ads", "coinzilla", "bitmedia", "mellowads"].includes(n.id)).length})</TabsTrigger>
          <TabsTrigger value="premium">Premium ({AD_NETWORKS.filter(n => ["medianet", "adsterra", "trafficstars"].includes(n.id)).length})</TabsTrigger>
          <TabsTrigger value="configured">Configured ({configuredCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {AD_NETWORKS.map((network) => (
              <AdNetworkCard
                key={network.id}
                network={{
                  ...network,
                  status: configs[network.id] ? "configured" : "not_configured",
                  enabled: configs[network.id]?.enabled || false,
                }}
                savedConfig={configs[network.id]?.config || {}}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="crypto" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {AD_NETWORKS.filter(n =>
              ["cointraffic", "a_ads", "coinzilla", "bitmedia", "mellowads"].includes(n.id)
            ).map((network) => (
              <AdNetworkCard
                key={network.id}
                network={{
                  ...network,
                  status: configs[network.id] ? "configured" : "not_configured",
                  enabled: configs[network.id]?.enabled || false,
                }}
                savedConfig={configs[network.id]?.config || {}}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="premium" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {AD_NETWORKS.filter(n =>
              ["medianet", "adsterra", "trafficstars"].includes(n.id)
            ).map((network) => (
              <AdNetworkCard
                key={network.id}
                network={{
                  ...network,
                  status: configs[network.id] ? "configured" : "not_configured",
                  enabled: configs[network.id]?.enabled || false,
                }}
                savedConfig={configs[network.id]?.config || {}}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="configured" className="space-y-4">
          {configuredCount === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">No ad networks configured yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure your first ad network to start earning revenue
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {AD_NETWORKS.filter(n => configs[n.id]).map((network) => (
                <AdNetworkCard
                  key={network.id}
                  network={{
                    ...network,
                    status: "configured",
                    enabled: configs[network.id]?.enabled || false,
                  }}
                  savedConfig={configs[network.id]?.config || {}}
                  onSave={handleSave}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { 
  Megaphone, 
  Wallet, 
  TrendingUp, 
  Eye, 
  MousePointer, 
  DollarSign,
  Plus,
  Pause,
  Play,
  Square,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  CreditCard,
  Zap,
  Globe,
  BarChart3
} from "lucide-react"
import { toast } from "sonner"
import useSWR from "swr"
import { cn } from "@/lib/utils"

interface AdNetwork {
  name: string
  minBudget: number
  cpm: number
}

interface Campaign {
  id: string
  name: string
  network: string
  network_name: string
  budget: number
  daily_budget: number
  spent: number
  target_url: string
  title: string
  description?: string
  status: string
  impressions: number
  clicks: number
  cpm: number
  created_at: string
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

const NETWORK_ICONS: Record<string, typeof Megaphone> = {
  "google-ads": Globe,
  "facebook-ads": Globe,
  "tiktok-ads": Zap,
  "twitter-ads": Globe,
  "banner-network": BarChart3,
  "native-ads": Eye,
  "push-notifications": Megaphone,
  "popup-ads": Eye
}

export default function AdvertisePage() {
  const [isDepositOpen, setIsDepositOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [depositAmount, setDepositAmount] = useState("")
  const [isDepositing, setIsDepositing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  
  // Campaign form state
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    network: "",
    budget: "",
    dailyBudget: "",
    targetUrl: "",
    title: "",
    description: ""
  })

  const { data: balanceData, mutate: refreshBalance } = useSWR(
    "/api/advertise?balance=true", 
    fetcher,
    { refreshInterval: 10000 }
  )
  
  const { data: networksData } = useSWR("/api/advertise?networks=true", fetcher)
  
  const { data: campaignsData, mutate: refreshCampaigns } = useSWR(
    "/api/advertise", 
    fetcher,
    { refreshInterval: 30000 }
  )

  const networks: Record<string, AdNetwork> = networksData?.networks || {}
  const campaigns: Campaign[] = campaignsData?.campaigns || []
  const balance = balanceData?.balance || 0

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) < 5) {
      toast.error("Minimum deposit is $5")
      return
    }

    setIsDepositing(true)
    try {
      const response = await fetch("/api/ccpayment/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(depositAmount),
          currency: "USD",
          purpose: "advertising"
        })
      })

      const data = await response.json()
      if (data.success) {
        toast.success("Deposit initiated", {
          description: "Complete the payment to add funds"
        })
        setIsDepositOpen(false)
        setDepositAmount("")
        // Open payment URL if provided
        if (data.order?.payAddress) {
          toast.info("Send payment to the address provided", {
            description: `Amount: ${data.order.paymentAmount} ${data.order.currency}`
          })
        }
      } else {
        toast.error(data.error || "Failed to create deposit")
      }
    } catch (error) {
      toast.error("Failed to create deposit")
    } finally {
      setIsDepositing(false)
    }
  }

  const handleCreateCampaign = async () => {
    const { name, network, budget, dailyBudget, targetUrl, title, description } = campaignForm

    if (!name || !network || !budget || !dailyBudget || !targetUrl || !title) {
      toast.error("Please fill in all required fields")
      return
    }

    const budgetNum = parseFloat(budget)
    const dailyBudgetNum = parseFloat(dailyBudget)

    if (budgetNum > balance) {
      toast.error("Insufficient balance")
      return
    }

    const networkConfig = networks[network]
    if (networkConfig && budgetNum < networkConfig.minBudget) {
      toast.error(`Minimum budget for ${networkConfig.name} is $${networkConfig.minBudget}`)
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch("/api/advertise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          network,
          budget: budgetNum,
          dailyBudget: dailyBudgetNum,
          targetUrl,
          title,
          description
        })
      })

      const data = await response.json()
      if (data.success) {
        toast.success("Campaign created!", {
          description: "Your campaign will be reviewed and activated shortly"
        })
        setIsCreateOpen(false)
        setCampaignForm({
          name: "", network: "", budget: "", dailyBudget: "",
          targetUrl: "", title: "", description: ""
        })
        refreshCampaigns()
        refreshBalance()
      } else {
        toast.error(data.error || "Failed to create campaign")
      }
    } catch (error) {
      toast.error("Failed to create campaign")
    } finally {
      setIsCreating(false)
    }
  }

  const handleCampaignAction = async (campaignId: string, action: string) => {
    try {
      const response = await fetch("/api/advertise", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, action })
      })

      const data = await response.json()
      if (data.success) {
        toast.success(`Campaign ${action === "stop" ? "stopped" : action === "pause" ? "paused" : "resumed"}`)
        refreshCampaigns()
        if (action === "stop") refreshBalance()
      } else {
        toast.error(data.error || "Action failed")
      }
    } catch (error) {
      toast.error("Action failed")
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
      active: { variant: "default", icon: Play },
      pending: { variant: "secondary", icon: Clock },
      paused: { variant: "outline", icon: Pause },
      stopped: { variant: "destructive", icon: Square },
      completed: { variant: "secondary", icon: CheckCircle2 }
    }
    const config = statusConfig[status] || statusConfig.pending
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const activeCampaigns = campaigns.filter(c => c.status === "active")
  const totalSpent = campaigns.reduce((sum, c) => sum + (c.spent || 0), 0)
  const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0)
  const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0)

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-primary" />
            Advertise
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Promote your business across multiple ad networks
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isDepositOpen} onOpenChange={setIsDepositOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <CreditCard className="h-4 w-4 mr-2" />
                Deposit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Deposit Advertising Funds</DialogTitle>
                <DialogDescription>
                  Add funds to your advertising balance using cryptocurrency
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Amount (USD)</Label>
                  <Input
                    type="number"
                    placeholder="10.00"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    min="5"
                    step="0.01"
                  />
                  <p className="text-xs text-muted-foreground">Minimum deposit: $5</p>
                </div>
                <div className="flex gap-2">
                  {[10, 25, 50, 100, 250].map((amount) => (
                    <Button
                      key={amount}
                      variant={depositAmount === amount.toString() ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setDepositAmount(amount.toString())}
                    >
                      ${amount}
                    </Button>
                  ))}
                </div>
                <Button 
                  className="w-full" 
                  onClick={handleDeposit}
                  disabled={isDepositing || !depositAmount}
                >
                  {isDepositing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Wallet className="h-4 w-4 mr-2" />
                      Deposit ${depositAmount || "0"}
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Advertising Campaign</DialogTitle>
                <DialogDescription>
                  Set up your campaign to reach your target audience
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Campaign Name *</Label>
                    <Input
                      placeholder="My Campaign"
                      value={campaignForm.name}
                      onChange={(e) => setCampaignForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ad Network *</Label>
                    <Select 
                      value={campaignForm.network}
                      onValueChange={(v) => setCampaignForm(f => ({ ...f, network: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select network" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(networks).map(([key, net]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <span>{net.name}</span>
                              <span className="text-xs text-muted-foreground">
                                (Min: ${net.minBudget})
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Total Budget ($) *</Label>
                    <Input
                      type="number"
                      placeholder="50.00"
                      value={campaignForm.budget}
                      onChange={(e) => setCampaignForm(f => ({ ...f, budget: e.target.value }))}
                      min="5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Daily Budget ($) *</Label>
                    <Input
                      type="number"
                      placeholder="10.00"
                      value={campaignForm.dailyBudget}
                      onChange={(e) => setCampaignForm(f => ({ ...f, dailyBudget: e.target.value }))}
                      min="1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Target URL *</Label>
                  <Input
                    type="url"
                    placeholder="https://your-website.com"
                    value={campaignForm.targetUrl}
                    onChange={(e) => setCampaignForm(f => ({ ...f, targetUrl: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Ad Title *</Label>
                  <Input
                    placeholder="Your amazing product"
                    value={campaignForm.title}
                    onChange={(e) => setCampaignForm(f => ({ ...f, title: e.target.value }))}
                    maxLength={100}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Ad Description</Label>
                  <Textarea
                    placeholder="Describe your product or service..."
                    value={campaignForm.description}
                    onChange={(e) => setCampaignForm(f => ({ ...f, description: e.target.value }))}
                    maxLength={500}
                    rows={3}
                  />
                </div>

                {campaignForm.network && networks[campaignForm.network] && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-sm font-medium mb-2">Estimated Reach</p>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">CPM</p>
                        <p className="font-medium">${networks[campaignForm.network].cpm}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Est. Impressions</p>
                        <p className="font-medium">
                          {campaignForm.budget 
                            ? ((parseFloat(campaignForm.budget) / networks[campaignForm.network].cpm) * 1000).toLocaleString()
                            : "0"
                          }
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Your Balance</p>
                        <p className="font-medium">${balance.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                )}

                <Button 
                  className="w-full" 
                  onClick={handleCreateCampaign}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Campaign
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ad Balance</p>
                <p className="text-2xl font-bold">${balance.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Campaigns</p>
                <p className="text-2xl font-bold">{activeCampaigns.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Eye className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Impressions</p>
                <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <MousePointer className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Clicks</p>
                <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ad Networks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available Ad Networks</CardTitle>
          <CardDescription>Choose from multiple advertising platforms</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(networks).map(([key, net]) => {
              const Icon = NETWORK_ICONS[key] || Globe
              return (
                <div
                  key={key}
                  className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium text-sm">{net.name}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Min: ${net.minBudget}</span>
                    <span>CPM: ${net.cpm}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Campaigns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Campaigns</CardTitle>
          <CardDescription>Manage and monitor your advertising campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-12">
              <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No campaigns yet</p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Campaign
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="p-4 rounded-lg border bg-card"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold">{campaign.name}</h3>
                        {getStatusBadge(campaign.status)}
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span>{campaign.network_name}</span>
                        <span>Budget: ${campaign.budget}</span>
                        <span>Spent: ${campaign.spent.toFixed(2)}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="text-right mr-4">
                        <div className="flex gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Impressions</p>
                            <p className="font-medium">{campaign.impressions.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Clicks</p>
                            <p className="font-medium">{campaign.clicks.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                      
                      {campaign.status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCampaignAction(campaign.id, "pause")}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      )}
                      {campaign.status === "paused" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCampaignAction(campaign.id, "resume")}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      {["active", "paused", "pending"].includes(campaign.status) && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleCampaignAction(campaign.id, "stop")}
                        >
                          <Square className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Budget Progress */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Budget Used</span>
                      <span>{((campaign.spent / campaign.budget) * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={(campaign.spent / campaign.budget) * 100} className="h-2" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">How Advertising Works</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>1. Deposit funds to your advertising balance using crypto</li>
                <li>2. Create a campaign and choose your target ad network</li>
                <li>3. Your campaign will be reviewed and activated within 24 hours</li>
                <li>4. Track impressions, clicks, and spending in real-time</li>
                <li>5. Pause or stop campaigns anytime - unused budget is refunded</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

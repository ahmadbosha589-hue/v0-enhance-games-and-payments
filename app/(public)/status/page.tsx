"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Server,
  Database,
  Globe,
  Wallet,
  Shield,
  Activity,
  Clock,
  Mail,
  Bell,
} from "lucide-react"

type ServiceStatus = "operational" | "degraded" | "outage" | "maintenance" | "unknown"

interface Service {
  name: string
  description: string
  status: ServiceStatus
  icon: typeof Server
  latency?: number
}

interface Incident {
  id: number
  title: string
  status: "investigating" | "identified" | "monitoring" | "resolved"
  severity: "minor" | "major" | "critical"
  createdAt: string
  updatedAt: string
  updates: { time: string; message: string }[]
}

interface FaucetHealthResponse {
  faucetPayConnected: boolean
  healthStatus: "healthy" | "moderate" | "low" | "critical" | "unknown"
  healthPercentage: number
}

const statusConfig = {
  operational: { color: "bg-emerald-500", label: "Operational", icon: CheckCircle },
  degraded: { color: "bg-amber-500", label: "Degraded", icon: AlertTriangle },
  outage: { color: "bg-red-500", label: "Outage", icon: XCircle },
  maintenance: { color: "bg-blue-500", label: "Maintenance", icon: Clock },
  unknown: { color: "bg-gray-500", label: "Unknown", icon: AlertTriangle },
}

export default function StatusPage() {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [email, setEmail] = useState("")
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [faucetPayStatus, setFaucetPayStatus] = useState<ServiceStatus>("operational")
  const [faucetPayLatency, setFaucetPayLatency] = useState<number | undefined>(undefined)
  const [faucetPayHealthPercentage, setFaucetPayHealthPercentage] = useState<number>(0)

  useEffect(() => {
    async function fetchFaucetPayHealth() {
      try {
        const startTime = Date.now()
        const response = await fetch("/api/faucet-health")
        const latency = Date.now() - startTime

        if (response.ok) {
          const data: FaucetHealthResponse = await response.json()
          setFaucetPayLatency(latency)
          setFaucetPayHealthPercentage(data.healthPercentage)

          // Map health status to service status
          if (!data.faucetPayConnected) {
            setFaucetPayStatus("unknown")
          } else if (data.healthStatus === "healthy") {
            setFaucetPayStatus("operational")
          } else if (data.healthStatus === "moderate" || data.healthStatus === "low") {
            setFaucetPayStatus("degraded")
          } else if (data.healthStatus === "critical") {
            setFaucetPayStatus("outage")
          } else {
            setFaucetPayStatus("unknown")
          }
        } else {
          setFaucetPayStatus("unknown")
        }
      } catch {
        setFaucetPayStatus("unknown")
      }
    }

    fetchFaucetPayHealth()
    const interval = setInterval(fetchFaucetPayHealth, 60000)
    return () => clearInterval(interval)
  }, [])

  const services: Service[] = [
    { name: "Website", description: "Main website and landing pages", status: "operational", icon: Globe, latency: 45 },
    {
      name: "User Dashboard",
      description: "User dashboard and account features",
      status: "operational",
      icon: Server,
      latency: 62,
    },
    { name: "Claim API", description: "Faucet claim processing", status: "operational", icon: Activity, latency: 38 },
    { name: "Database", description: "Primary database cluster", status: "operational", icon: Database, latency: 12 },
    {
      name: "FaucetPay Integration",
      description: "Withdrawal processing to FaucetPay",
      status: faucetPayStatus,
      icon: Wallet,
      latency: faucetPayLatency,
    },
    {
      name: "Authentication",
      description: "Login, signup, and session management",
      status: "operational",
      icon: Shield,
      latency: 28,
    },
  ]

  const [incidents] = useState<Incident[]>([
    {
      id: 1,
      title: "Scheduled Database Maintenance",
      status: "resolved",
      severity: "minor",
      createdAt: "2025-12-10T02:00:00Z",
      updatedAt: "2025-12-10T04:30:00Z",
      updates: [
        { time: "04:30 UTC", message: "Maintenance completed successfully. All systems operational." },
        {
          time: "02:00 UTC",
          message: "Starting scheduled database maintenance. Some users may experience brief delays.",
        },
      ],
    },
    {
      id: 2,
      title: "FaucetPay API Intermittent Delays",
      status: "resolved",
      severity: "minor",
      createdAt: "2025-12-08T14:22:00Z",
      updatedAt: "2025-12-08T16:45:00Z",
      updates: [
        {
          time: "16:45 UTC",
          message: "FaucetPay has resolved the issue on their end. Withdrawals processing normally.",
        },
        { time: "15:30 UTC", message: "FaucetPay confirmed they are experiencing high load. We are monitoring." },
        { time: "14:22 UTC", message: "Investigating reports of delayed withdrawals to FaucetPay." },
      ],
    },
  ])

  const overallStatus = services.every((s) => s.status === "operational")
    ? "operational"
    : services.some((s) => s.status === "outage")
      ? "outage"
      : "degraded"

  const handleRefresh = async () => {
    setIsRefreshing(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setLastUpdated(new Date())
    setIsRefreshing(false)
  }

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address")
      return
    }

    setIsSubscribing(true)

    try {
      // In production, this would call an API to save the subscription
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setIsSubscribed(true)
      toast.success("Successfully subscribed to status updates!")
      setEmail("")
    } catch {
      toast.error("Failed to subscribe. Please try again.")
    } finally {
      setIsSubscribing(false)
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated(new Date())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const uptimePercentage = 99.98 // Would come from real monitoring

  return (
    <div className="container max-w-4xl py-16">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">System Status</h1>
        <p className="text-muted-foreground">Real-time status of CryptoFaucet services and infrastructure</p>
      </div>

      {/* Overall Status */}
      <Card
        className={`mb-8 border-2 ${overallStatus === "operational" ? "border-emerald-500/50 bg-emerald-500/5" : overallStatus === "outage" ? "border-red-500/50 bg-red-500/5" : "border-amber-500/50 bg-amber-500/5"}`}
      >
        <CardContent className="flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full ${statusConfig[overallStatus].color}`}
            >
              {(() => {
                const Icon = statusConfig[overallStatus].icon
                return <Icon className="h-6 w-6 text-white" />
              })()}
            </div>
            <div>
              <h2 className="text-xl font-bold">
                {overallStatus === "operational"
                  ? "All Systems Operational"
                  : overallStatus === "outage"
                    ? "Major System Outage"
                    : "Partial System Degradation"}
              </h2>
              <p className="text-sm text-muted-foreground">Last updated: {lastUpdated.toLocaleTimeString()}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Uptime Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-500">{uptimePercentage}%</div>
            <div className="text-xs text-muted-foreground">Uptime (30 days)</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">58ms</div>
            <div className="text-xs text-muted-foreground">Avg Response Time</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-500">0</div>
            <div className="text-xs text-muted-foreground">Active Incidents</div>
          </CardContent>
        </Card>
      </div>

      {/* Services */}
      <Card className="mb-8 border-border/50">
        <CardHeader>
          <CardTitle>Service Status</CardTitle>
          <CardDescription>Current status of all CryptoFaucet services</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {services.map((service) => {
            const config = statusConfig[service.status]
            return (
              <div
                key={service.name}
                className="flex items-center justify-between border-b border-border/50 pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <service.icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{service.name}</div>
                    <div className="text-sm text-muted-foreground">{service.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {service.latency && <span className="text-sm text-muted-foreground">{service.latency}ms</span>}
                  <Badge
                    variant="outline"
                    className={`${service.status === "operational" ? "border-emerald-500 text-emerald-500" : service.status === "degraded" ? "border-amber-500 text-amber-500" : "border-red-500 text-red-500"}`}
                  >
                    <span className={`mr-1.5 h-2 w-2 rounded-full ${config.color}`} />
                    {config.label}
                  </Badge>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Recent Incidents */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Recent Incidents</CardTitle>
          <CardDescription>Past incidents and their resolutions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {incidents.map((incident) => (
            <div key={incident.id} className="border-l-2 border-border pl-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium">{incident.title}</h3>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      incident.severity === "critical"
                        ? "destructive"
                        : incident.severity === "major"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {incident.severity}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      incident.status === "resolved"
                        ? "border-emerald-500 text-emerald-500"
                        : "border-amber-500 text-amber-500"
                    }
                  >
                    {incident.status}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                {incident.updates.map((update, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium text-muted-foreground">{update.time}</span>
                    <span className="mx-2">—</span>
                    <span className="text-muted-foreground">{update.message}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Subscribe */}
      <Card className="mt-8 border-primary/20 bg-primary/5">
        <CardContent className="p-6">
          {isSubscribed ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <Bell className="h-6 w-6 text-emerald-500" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">You're Subscribed!</h3>
              <p className="text-sm text-muted-foreground">
                You'll receive email notifications about incidents and scheduled maintenance.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">Subscribe to Status Updates</h3>
                <p className="text-sm text-muted-foreground">
                  Get notified about incidents and scheduled maintenance via email.
                </p>
              </div>
              <form onSubmit={handleSubscribe} className="mx-auto flex max-w-md gap-2">
                <Input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1"
                  disabled={isSubscribing}
                />
                <Button type="submit" disabled={isSubscribing || !email}>
                  {isSubscribing ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Subscribing...
                    </>
                  ) : (
                    "Subscribe"
                  )}
                </Button>
              </form>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                We'll only send you important updates. No spam, unsubscribe anytime.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
  Loader2, Save, Trash2, CheckCircle2, AlertCircle,
  Eye, EyeOff, RefreshCw, Zap, ShieldCheck, Info,
} from "lucide-react"

interface FaucetPayStatus {
  configured: boolean
  source: "database" | "environment" | null
  maskedKey: string | null
  updatedAt: string | null
  fromEnv: boolean
}

export function AdminFaucetPayForm() {
  const [status, setStatus] = useState<FaucetPayStatus | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [testResult, setTestResult] = useState<{
    valid: boolean
    balance?: number
    currency?: string
    error?: string
  } | null>(null)

  const fetchStatus = useCallback(async () => {
    setIsLoadingStatus(true)
    try {
      const res = await fetch("/api/admin/faucetpay")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus(await res.json())
    } catch {
      toast.error("Failed to load FaucetPay configuration")
    } finally {
      setIsLoadingStatus(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const handleTest = async () => {
    const key = apiKeyInput.trim()
    if (!key) { toast.error("Enter an API key to test"); return }
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await fetch("/api/admin/faucetpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, testOnly: true }),
      })
      const data = await res.json()
      setTestResult({ valid: data.valid, balance: data.balance, currency: data.currency, error: data.error })
      if (data.valid) {
        toast.success("API key is valid!", { description: `Balance: ${data.balance ?? "N/A"} ${data.currency ?? ""}` })
      } else {
        toast.error("Invalid API key", { description: data.error })
      }
    } catch {
      toast.error("Test request failed")
      setTestResult({ valid: false, error: "Network error" })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = async () => {
    const key = apiKeyInput.trim()
    if (!key) { toast.error("Enter an API key to save"); return }
    setIsSaving(true)
    setTestResult(null)
    try {
      const res = await fetch("/api/admin/faucetpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setTestResult({ valid: false, error: data.error })
        toast.error("Failed to save", { description: data.error })
        return
      }
      setTestResult({ valid: true, balance: data.balance, currency: data.currency })
      toast.success("FaucetPay API key saved!", {
        description: `Verified and active. Balance: ${data.balance ?? "N/A"} ${data.currency ?? ""}`,
      })
      setApiKeyInput("")
      await fetchStatus()
    } catch {
      toast.error("Save request failed")
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm("Remove the FaucetPay API key from the database? Payouts will use the environment variable if set, otherwise be disabled.")) return
    setIsRemoving(true)
    try {
      const res = await fetch("/api/admin/faucetpay", { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("API key removed", { description: data.message })
      setTestResult(null)
      setApiKeyInput("")
      await fetchStatus()
    } catch (err) {
      toast.error("Failed to remove key", { description: err instanceof Error ? err.message : "Unknown error" })
    } finally {
      setIsRemoving(false)
    }
  }

  if (isLoadingStatus) {
    return (
      <div className="flex items-center gap-3 py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading FaucetPay configuration...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-muted/30">
        <div className="space-y-1">
          <p className="text-sm font-medium">Current Status</p>
          {status?.configured ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-600 font-medium">Configured and active</span>
                <Badge variant="outline" className="text-xs">
                  {status.source === "database" ? "DB key" : "Env var"}
                </Badge>
              </div>
              {status.maskedKey && (
                <p className="text-xs font-mono text-muted-foreground">
                  Key: {status.maskedKey}
                </p>
              )}
              {status.updatedAt && status.source === "database" && (
                <p className="text-xs text-muted-foreground">
                  Last updated: {new Date(status.updatedAt).toLocaleString()}
                </p>
              )}
              {status.fromEnv && (
                <p className="text-xs text-muted-foreground">
                  Set via <code className="bg-muted px-1 rounded text-xs">FAUCETPAY_API_KEY</code> environment variable — save a new key below to override.
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive font-medium">Not configured — payouts are disabled</span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={fetchStatus} className="flex-shrink-0 h-8 w-8">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Separator />

      {/* Set New Key */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">{status?.configured && status.source === "database" ? "Replace API Key" : "Set API Key"}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get your API key from{" "}
            <a href="https://faucetpay.io/account/webmaster" target="_blank" rel="noopener noreferrer"
              className="text-primary underline underline-offset-2">
              faucetpay.io → Account → Webmaster Tools
            </a>
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="faucetpay-api-key">API Key</Label>
          <div className="relative">
            <Input
              id="faucetpay-api-key"
              type={showKey ? "text" : "password"}
              placeholder="Paste your FaucetPay API key here"
              value={apiKeyInput}
              onChange={e => { setApiKeyInput(e.target.value); setTestResult(null) }}
              className="pr-10 font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowKey(v => !v)}
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Test Result */}
        {testResult && (
          <Alert variant={testResult.valid ? "default" : "destructive"} className="py-3">
            {testResult.valid
              ? <CheckCircle2 className="h-4 w-4 text-green-500" />
              : <AlertCircle className="h-4 w-4" />}
            <AlertTitle className="text-sm">
              {testResult.valid ? "API key is valid" : "API key rejected"}
            </AlertTitle>
            <AlertDescription className="text-xs mt-0.5">
              {testResult.valid
                ? `FaucetPay accepted the key. BTC balance: ${testResult.balance ?? "N/A"} satoshis.`
                : testResult.error}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={isTesting || isSaving || !apiKeyInput.trim()}
          >
            {isTesting
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Zap className="h-4 w-4 mr-2" />}
            Test Key
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || isTesting || !apiKeyInput.trim()}
          >
            {isSaving
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Save className="h-4 w-4 mr-2" />}
            Test & Save Key
          </Button>
          {status?.configured && status.source === "database" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={isRemoving || isSaving || isTesting}
              className="ml-auto"
            >
              {isRemoving
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Trash2 className="h-4 w-4 mr-2" />}
              Remove Key
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Info */}
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex gap-2">
          <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
          <p>The API key is stored encrypted in the database. It is never exposed in full after saving — only the last 6 characters are shown.</p>
        </div>
        <div className="flex gap-2">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
          <p>If both a database key and an <code className="bg-muted px-1 rounded">FAUCETPAY_API_KEY</code> environment variable are set, the database key takes priority. Remove the database key to revert to the environment variable.</p>
        </div>
      </div>
    </div>
  )
}

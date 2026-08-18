"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Loader2, Save, RotateCcw } from "lucide-react"
import { CLAIM_CONFIG, WITHDRAWAL_CONFIG, FRAUD_CONFIG } from "@/lib/constants/config"

interface SystemSettingsFormProps {
  category: "claim" | "withdrawal" | "security"
  settings: Record<string, unknown>
}

interface FieldConfig {
  key: string
  label: string
  default: number | boolean
  type: "number" | "boolean"
  description?: string
  min?: number
  max?: number
}

function parseSettingValue(value: unknown, defaultValue: number | boolean): number | boolean {
  if (value === null || value === undefined) {
    return defaultValue
  }
  // Handle JSONB stored as string (e.g., "60" or "true")
  if (typeof value === "string") {
    if (value === "true") return true
    if (value === "false") return false
    const num = Number(value)
    return isNaN(num) ? defaultValue : num
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value
  }
  return defaultValue
}

export function SystemSettingsForm({ category, settings }: SystemSettingsFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, number | boolean>>({})

  const getFields = (): FieldConfig[] => {
    switch (category) {
      case "claim":
        return [
          {
            key: "base_claim_amount_satoshis",
            label: "Base Claim Amount",
            default: CLAIM_CONFIG.baseAmountSatoshis,
            type: "number",
            description: "Base satoshis awarded per claim",
            min: 1,
            max: 10000,
          },
          {
            key: "max_claim_amount_satoshis",
            label: "Maximum Claim Amount",
            default: CLAIM_CONFIG.maxAmountSatoshis,
            type: "number",
            description: "Maximum satoshis per claim (with bonuses)",
            min: 1,
            max: 100000,
          },
          {
            key: "claim_cooldown_seconds",
            label: "Cooldown (seconds)",
            default: CLAIM_CONFIG.cooldownSeconds,
            type: "number",
            description: "Time between claims",
            min: 60,
            max: 86400,
          },
          {
            key: "streak_bonus_percentage",
            label: "Streak Bonus (%)",
            default: CLAIM_CONFIG.streakBonusPercentage,
            type: "number",
            description: "Bonus percentage per streak day",
            min: 0,
            max: 50,
          },
          {
            key: "max_streak_bonus_percentage",
            label: "Max Streak Bonus (%)",
            default: CLAIM_CONFIG.maxStreakBonusPercentage,
            type: "number",
            description: "Maximum total streak bonus",
            min: 0,
            max: 500,
          },
        ]
      case "withdrawal":
        return [
          {
            key: "minimum_withdrawal_satoshis",
            label: "Minimum Withdrawal",
            default: WITHDRAWAL_CONFIG.minimumSatoshis,
            type: "number",
            description: "Minimum amount to withdraw",
            min: 1000,
            max: 1000000,
          },
          {
            key: "maximum_withdrawal_satoshis",
            label: "Maximum Withdrawal",
            default: WITHDRAWAL_CONFIG.dailyLimitSatoshis,
            type: "number",
            description: "Maximum amount per withdrawal",
            min: 1000,
            max: 10000000,
          },
          {
            key: "daily_withdrawal_limit_satoshis",
            label: "Daily Limit",
            default: WITHDRAWAL_CONFIG.dailyLimitSatoshis,
            type: "number",
            description: "Maximum daily withdrawal per user",
            min: 10000,
            max: 10000000,
          },
          {
            key: "withdrawal_fee_percentage",
            label: "Fee (%)",
            default: WITHDRAWAL_CONFIG.feePercentage,
            type: "number",
            description: "Withdrawal fee percentage",
            min: 0,
            max: 20,
          },
        ]
      case "security":
        return [
          {
            key: "manual_review_threshold",
            label: "Manual Review Threshold",
            default: FRAUD_CONFIG.manualReviewScore,
            type: "number",
            description: "Score to trigger manual review",
            min: 0,
            max: 100,
          },
          {
            key: "auto_ban_threshold",
            label: "Auto-Ban Threshold",
            default: FRAUD_CONFIG.autoBanScore,
            type: "number",
            description: "Score to automatically ban",
            min: 0,
            max: 100,
          },
          {
            key: "max_accounts_per_ip",
            label: "Max Accounts Per IP",
            default: FRAUD_CONFIG.maxAccountsPerIP,
            type: "number",
            description: "Maximum accounts from same IP",
            min: 1,
            max: 100,
          },
          {
            key: "max_accounts_per_device",
            label: "Max Accounts Per Device",
            default: FRAUD_CONFIG.maxAccountsPerDevice || 2,
            type: "number",
            description: "Maximum accounts from same device",
            min: 1,
            max: 100,
          },
        ]
      default:
        return []
    }
  }

  const fields = getFields()

  useEffect(() => {
    const initialValues: Record<string, number | boolean> = {}
    for (const field of fields) {
      initialValues[field.key] = parseSettingValue(settings[field.key], field.default)
    }
    setFormValues(initialValues)
  }, [settings, category])

  const handleInputChange = (key: string, value: string | boolean, type: "number" | "boolean") => {
    setHasChanges(true)
    if (type === "boolean") {
      setFormValues((prev) => ({ ...prev, [key]: value as boolean }))
    } else {
      const numValue = value === "" ? 0 : Number(value)
      setFormValues((prev) => ({ ...prev, [key]: numValue }))
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const updates: Record<string, number | boolean> = {}
    for (const field of fields) {
      updates[field.key] = formValues[field.key] ?? field.default
    }

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ category, updates }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to save")
      }

      toast.success("Settings saved successfully")
      setHasChanges(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings")
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    const resetValues: Record<string, number | boolean> = {}
    for (const field of fields) {
      resetValues[field.key] = parseSettingValue(settings[field.key], field.default)
    }
    setFormValues(resetValues)
    setHasChanges(false)
    toast.info("Form reset to saved values")
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={field.key}>{field.label}</Label>
              {field.type === "boolean" ? (
                <Switch
                  id={field.key}
                  checked={(formValues[field.key] as boolean) ?? field.default}
                  onCheckedChange={(checked) => handleInputChange(field.key, checked, "boolean")}
                />
              ) : null}
            </div>
            {field.type === "number" && (
              <Input
                id={field.key}
                name={field.key}
                type="number"
                value={Number(formValues[field.key] ?? field.default)}
                onChange={(e) => handleInputChange(field.key, e.target.value, "number")}
                min={field.min}
                max={field.max}
                className="font-mono"
              />
            )}
            {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <Button type="button" variant="outline" onClick={handleReset} disabled={loading || !hasChanges}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
        <Button type="submit" disabled={loading || !hasChanges}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import type { Profile } from "@/lib/types/database"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { WITHDRAWAL_CONFIG } from "@/lib/constants/config"
import { formatSatoshisDisplay } from "@/lib/utils/format"
import { Loader2, Wallet, AlertCircle, CheckCircle2, Info } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"

interface WithdrawalFormProps {
  profile: Profile
  canWithdraw: boolean
}

type WithdrawalState = "idle" | "validating" | "submitting" | "success" | "error"

export function WithdrawalForm({ profile, canWithdraw }: WithdrawalFormProps) {
  const [amount, setAmount] = useState("")
  const [state, setState] = useState<WithdrawalState>("idle")
  const [dailyUsed, setDailyUsed] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const router = useRouter()

  const amountNum = Number.parseInt(amount) || 0
  const fee = Math.ceil((amountNum * WITHDRAWAL_CONFIG.feePercentage) / 100)
  const netAmount = amountNum - fee
  const maxAmount = Math.min(
    Number(profile.balance_satoshis),
    WITHDRAWAL_CONFIG.dailyLimitSatoshis - dailyUsed,
    WITHDRAWAL_CONFIG.maximumSatoshis,
  )
  const remainingDaily = WITHDRAWAL_CONFIG.dailyLimitSatoshis - dailyUsed

  // Fetch daily usage and pending count
  useEffect(() => {
    async function fetchWithdrawalStats() {
      try {
        const response = await fetch("/api/withdraw?stats=true")
        if (response.ok) {
          const data = await response.json()
          setDailyUsed(data.dailyUsed || 0)
          setPendingCount(data.pendingCount || 0)
        }
      } catch (e) {
        console.error("Failed to fetch withdrawal stats")
      }
    }
    fetchWithdrawalStats()
  }, [])

  // Validation errors
  const getValidationErrors = (): string[] => {
    const errors: string[] = []
    if (!profile.faucetpay_email) {
      errors.push("FaucetPay email not configured")
    }
    if (amountNum > 0 && amountNum < WITHDRAWAL_CONFIG.minimumSatoshis) {
      errors.push(`Minimum withdrawal is ${formatSatoshisDisplay(WITHDRAWAL_CONFIG.minimumSatoshis)}`)
    }
    if (amountNum > Number(profile.balance_satoshis)) {
      errors.push("Insufficient balance")
    }
    if (amountNum > remainingDaily) {
      errors.push(`Exceeds daily limit. Remaining: ${formatSatoshisDisplay(remainingDaily)}`)
    }
    if (pendingCount >= 3) {
      errors.push("You have too many pending withdrawals (max 3)")
    }
    if (profile.is_flagged && profile.fraud_score >= 50) {
      errors.push("Account under review - withdrawals temporarily disabled")
    }
    return errors
  }

  const validationErrors = getValidationErrors()
  const isValid = amountNum >= WITHDRAWAL_CONFIG.minimumSatoshis && validationErrors.length === 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isValid || !canWithdraw) return

    setState("submitting")

    try {
      const response = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNum }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to process withdrawal")
      }

      setState("success")
      toast.success("Withdrawal request submitted!", {
        description: `${formatSatoshisDisplay(netAmount)} will be sent to your FaucetPay`,
      })

      setTimeout(() => {
        setAmount("")
        setState("idle")
        router.refresh()
      }, 2000)
    } catch (error) {
      setState("error")
      toast.error(error instanceof Error ? error.message : "Failed to withdraw")
      setTimeout(() => setState("idle"), 2000)
    }
  }

  const handleSliderChange = (value: number[]) => {
    setAmount(value[0].toString())
  }

  const quickAmounts = [
    WITHDRAWAL_CONFIG.minimumSatoshis,
    Math.floor(maxAmount * 0.25),
    Math.floor(maxAmount * 0.5),
    Math.floor(maxAmount * 0.75),
    maxAmount,
  ].filter((v, i, a) => v > 0 && a.indexOf(v) === i)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* FaucetPay Status */}
      {!profile.faucetpay_email && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Configure your FaucetPay email to enable withdrawals</span>
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <Link href="/dashboard/settings">Setup Now</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Daily Limit Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Daily Withdrawal Limit</span>
          <span>
            {formatSatoshisDisplay(dailyUsed)} / {formatSatoshisDisplay(WITHDRAWAL_CONFIG.dailyLimitSatoshis)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(dailyUsed / WITHDRAWAL_CONFIG.dailyLimitSatoshis) * 100}%` }}
          />
        </div>
      </div>

      {/* Amount Input */}
      <div className="space-y-4">
        <Label htmlFor="amount">Withdrawal Amount</Label>

        {/* Slider */}
        <div className="px-2">
          <Slider
            value={[amountNum]}
            onValueChange={handleSliderChange}
            min={0}
            max={maxAmount}
            step={100}
            disabled={!canWithdraw || state === "submitting" || maxAmount === 0}
            className="py-4"
          />
        </div>

        {/* Input with Max Button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="amount"
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!canWithdraw || state === "submitting"}
              className="pr-20 text-lg font-mono"
              min={0}
              max={maxAmount}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">sats</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAmount(maxAmount.toString())}
            disabled={!canWithdraw || state === "submitting" || maxAmount === 0}
          >
            Max
          </Button>
        </div>

        {/* Quick Amount Buttons */}
        <div className="flex flex-wrap gap-2">
          {quickAmounts.map((quickAmount) => (
            <Button
              key={quickAmount}
              type="button"
              variant={amountNum === quickAmount ? "secondary" : "outline"}
              size="sm"
              onClick={() => setAmount(quickAmount.toString())}
              disabled={!canWithdraw || state === "submitting"}
              className="text-xs"
            >
              {formatSatoshisDisplay(quickAmount)}
            </Button>
          ))}
        </div>
      </div>

      {/* Fee Breakdown */}
      <AnimatePresence mode="wait">
        {amountNum > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Withdrawal Amount</span>
                <span className="font-mono">{formatSatoshisDisplay(amountNum)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  Network Fee ({WITHDRAWAL_CONFIG.feePercentage}%)
                  <Info className="h-3 w-3" />
                </span>
                <span className="font-mono text-destructive">-{formatSatoshisDisplay(fee)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between font-medium">
                <span>You&apos;ll Receive</span>
                <span className="font-mono text-lg text-primary">{formatSatoshisDisplay(netAmount)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation Errors */}
      {validationErrors.length > 0 && amountNum > 0 && (
        <div className="space-y-2">
          {validationErrors.map((error, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ))}
        </div>
      )}

      {/* Destination */}
      <div className="space-y-2">
        <Label>Destination</Label>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">FaucetPay</p>
            <p className="text-xs text-muted-foreground font-mono">{profile.faucetpay_email || "Not configured"}</p>
          </div>
          {profile.faucetpay_email && <CheckCircle2 className="h-5 w-5 text-green-500" />}
        </div>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full h-12 text-base"
        disabled={!isValid || !canWithdraw || state === "submitting"}
      >
        <AnimatePresence mode="wait">
          {state === "submitting" ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <Loader2 className="h-5 w-5 animate-spin" />
              Processing Withdrawal...
            </motion.div>
          ) : state === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <CheckCircle2 className="h-5 w-5" />
              Withdrawal Submitted!
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Request Withdrawal
            </motion.div>
          )}
        </AnimatePresence>
      </Button>

      {/* Help Text */}
      <p className="text-xs text-center text-muted-foreground">
        Withdrawals are processed automatically every 5 minutes. Minimum{" "}
        {formatSatoshisDisplay(WITHDRAWAL_CONFIG.minimumSatoshis)}.
      </p>
    </form>
  )
}

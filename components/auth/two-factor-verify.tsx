"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Shield, AlertCircle, Key } from "lucide-react"
import { LogoFull } from "@/components/icons/logo"
import Link from "next/link"

interface TwoFactorVerifyProps {
  userId: string
  onSuccess: () => void
  onCancel: () => void
}

export function TwoFactorVerify({ userId, onSuccess, onCancel }: TwoFactorVerifyProps) {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [remainingCodes, setRemainingCodes] = useState<number | null>(null)

  const handleVerify = async () => {
    if (!code) {
      setError("Please enter a code")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/2fa/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code, useBackupCode }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Invalid code")
      }

      if (data.remainingBackupCodes !== undefined) {
        setRemainingCodes(data.remainingBackupCodes)
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed")
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && code.length >= 6) {
      handleVerify()
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-6 md:p-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/4 top-1/4 h-[300px] w-[300px] sm:h-[400px] sm:w-[400px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-[200px] w-[200px] sm:h-[300px] sm:w-[300px] rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="mb-6 sm:mb-8">
        <Link href="/" aria-label="Go to homepage">
          <LogoFull size="lg" />
        </Link>
      </div>

      <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl sm:text-2xl">Two-Factor Authentication</CardTitle>
          <CardDescription>
            {useBackupCode ? "Enter one of your backup codes" : "Enter the 6-digit code from your authenticator app"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {remainingCodes !== null && remainingCodes <= 3 && (
            <Alert className="border-amber-500/20 bg-amber-500/5">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-200">
                You only have {remainingCodes} backup codes remaining. Consider generating new ones.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="2fa-code">{useBackupCode ? "Backup Code" : "Authentication Code"}</Label>
            <Input
              id="2fa-code"
              placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
              value={code}
              onChange={(e) =>
                setCode(useBackupCode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              onKeyDown={handleKeyDown}
              className="text-center text-2xl tracking-widest font-mono"
              maxLength={useBackupCode ? 9 : 6}
              autoFocus
              disabled={loading}
            />
          </div>

          <Button
            onClick={handleVerify}
            disabled={loading || (useBackupCode ? code.length < 8 : code.length !== 6)}
            className="w-full"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify
          </Button>

          <div className="flex flex-col items-center gap-2 pt-2">
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-muted-foreground"
              onClick={() => {
                setUseBackupCode(!useBackupCode)
                setCode("")
                setError(null)
              }}
            >
              <Key className="mr-2 h-3 w-3" />
              {useBackupCode ? "Use authenticator code" : "Use a backup code"}
            </Button>

            <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={onCancel}>
              Back to login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

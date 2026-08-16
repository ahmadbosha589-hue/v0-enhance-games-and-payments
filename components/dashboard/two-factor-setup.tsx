"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { Loader2, Copy, Check, Shield, Smartphone, Key, AlertTriangle, Download, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

interface TwoFactorSetupProps {
  isEnabled: boolean
  enabledAt: string | null
  backupCodesRemaining: number
  onStatusChange: () => void
}

export function TwoFactorSetup({ isEnabled, enabledAt, backupCodesRemaining, onStatusChange }: TwoFactorSetupProps) {
  const [setupOpen, setSetupOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [backupCodesOpen, setBackupCodesOpen] = useState(false)
  const [regenerateOpen, setRegenerateOpen] = useState(false)

  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<"qr" | "verify" | "backup">("qr")

  const [secret, setSecret] = useState("")
  const [otpauthUri, setOtpauthUri] = useState("")
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [verifyCode, setVerifyCode] = useState("")
  const [disableCode, setDisableCode] = useState("")
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [regenerateCode, setRegenerateCode] = useState("")
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [copiedBackup, setCopiedBackup] = useState(false)

  const handleStartSetup = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/2fa/setup", { method: "POST" })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to setup 2FA")
      }

      setSecret(data.secret)
      setOtpauthUri(data.otpauthUri)
      setBackupCodes(data.backupCodes)
      setStep("qr")
      setSetupOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to setup 2FA")
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyAndEnable = async () => {
    if (verifyCode.length !== 6) {
      toast.error("Please enter a 6-digit code")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Invalid code")
      }

      setStep("backup")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed")
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteSetup = () => {
    setSetupOpen(false)
    setStep("qr")
    setVerifyCode("")
    setSecret("")
    setOtpauthUri("")
    setBackupCodes([])
    onStatusChange()
    toast.success("Two-factor authentication enabled successfully!")
  }

  const handleDisable2FA = async () => {
    if (!disableCode) {
      toast.error("Please enter a code")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode, useBackupCode }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to disable 2FA")
      }

      setDisableOpen(false)
      setDisableCode("")
      setUseBackupCode(false)
      onStatusChange()
      toast.success("Two-factor authentication disabled")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disable 2FA")
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerateBackupCodes = async () => {
    if (regenerateCode.length !== 6) {
      toast.error("Please enter a 6-digit code")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/2fa/backup-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: regenerateCode }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to regenerate codes")
      }

      setBackupCodes(data.backupCodes)
      setRegenerateOpen(false)
      setBackupCodesOpen(true)
      setRegenerateCode("")
      onStatusChange()
      toast.success("Backup codes regenerated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to regenerate codes")
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (text: string, type: "secret" | "backup") => {
    await navigator.clipboard.writeText(text)
    if (type === "secret") {
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 2000)
    } else {
      setCopiedBackup(true)
      setTimeout(() => setCopiedBackup(false), 2000)
    }
    toast.success("Copied to clipboard")
  }

  const downloadBackupCodes = () => {
    const content = `Faucero Two-Factor Authentication Backup Codes
Generated: ${new Date().toISOString()}

IMPORTANT: Store these codes in a safe place.
Each code can only be used once.

${backupCodes.join("\n")}

If you lose access to your authenticator app, you can use one of these codes to sign in.`

    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "faucero-backup-codes.txt"
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Backup codes downloaded")
  }

  // Generate QR code URL using Google Charts API
  const qrCodeUrl = otpauthUri
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUri)}`
    : ""

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <Label>Two-Factor Authentication</Label>
          </div>
          <p className="text-sm text-muted-foreground">Add an extra layer of security to your account</p>
        </div>
        <div className="flex items-center gap-2">
          {isEnabled ? (
            <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              Enabled
            </Badge>
          ) : (
            <Badge variant="secondary">Disabled</Badge>
          )}
        </div>
      </div>

      {isEnabled && enabledAt && (
        <p className="text-xs text-muted-foreground">Enabled on {new Date(enabledAt).toLocaleDateString()}</p>
      )}

      {isEnabled && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <Key className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-500">Backup Codes</p>
            <p className="text-xs text-muted-foreground">{backupCodesRemaining} backup codes remaining</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRegenerateOpen(true)}>
            <RefreshCw className="mr-2 h-3 w-3" />
            Regenerate
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!isEnabled ? (
          <Button onClick={handleStartSetup} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Key className="mr-2 h-4 w-4" />
            Setup 2FA
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => setDisableOpen(true)}>
            Disable 2FA
          </Button>
        )}
      </div>

      {/* Setup Dialog */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {step === "qr" && "Setup Two-Factor Authentication"}
              {step === "verify" && "Verify Your Authenticator"}
              {step === "backup" && "Save Your Backup Codes"}
            </DialogTitle>
            <DialogDescription>
              {step === "qr" && "Scan the QR code with your authenticator app"}
              {step === "verify" && "Enter the 6-digit code from your authenticator app"}
              {step === "backup" &&
                "Store these codes safely - they can be used if you lose access to your authenticator"}
            </DialogDescription>
          </DialogHeader>

          {step === "qr" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="rounded-lg bg-white p-4">
                  {qrCodeUrl && (
                    <img
                      src={qrCodeUrl || "/placeholder.svg"}
                      alt="2FA QR Code"
                      width={200}
                      height={200}
                      className="rounded"
                    />
                  )}
                </div>
              </div>

              <Alert>
                <AlertDescription className="text-xs">
                  Can&apos;t scan? Enter this code manually in your authenticator app:
                </AlertDescription>
              </Alert>

              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted p-2 text-xs font-mono break-all">{secret}</code>
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(secret, "secret")}>
                  {copiedSecret ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <Button className="w-full" onClick={() => setStep("verify")}>
                Continue
              </Button>
            </div>
          )}

          {step === "verify" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verify-code">Authentication Code</Label>
                <Input
                  id="verify-code"
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-center text-2xl tracking-widest font-mono"
                  maxLength={6}
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("qr")} className="flex-1">
                  Back
                </Button>
                <Button
                  onClick={handleVerifyAndEnable}
                  disabled={loading || verifyCode.length !== 6}
                  className="flex-1"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify
                </Button>
              </div>
            </div>
          )}

          {step === "backup" && (
            <div className="space-y-4">
              <Alert className="border-amber-500/20 bg-amber-500/5">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-amber-200">
                  Save these codes now! You won&apos;t be able to see them again.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/50 p-4">
                {backupCodes.map((code, i) => (
                  <code key={i} className="text-sm font-mono text-center py-1">
                    {code}
                  </code>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(backupCodes.join("\n"), "backup")}
                  className="flex-1"
                >
                  {copiedBackup ? (
                    <Check className="mr-2 h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  Copy
                </Button>
                <Button variant="outline" onClick={downloadBackupCodes} className="flex-1 bg-transparent">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>

              <Button onClick={handleCompleteSetup} className="w-full">
                I&apos;ve Saved My Codes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable 2FA Dialog */}
      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Two-Factor Authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make your account less secure. Enter your authentication code to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="disable-code">{useBackupCode ? "Backup Code" : "Authentication Code"}</Label>
              <Input
                id="disable-code"
                placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
                value={disableCode}
                onChange={(e) =>
                  setDisableCode(
                    useBackupCode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                className="text-center text-xl tracking-widest font-mono"
              />
            </div>

            <Button
              variant="link"
              size="sm"
              className="px-0 h-auto"
              onClick={() => {
                setUseBackupCode(!useBackupCode)
                setDisableCode("")
              }}
            >
              {useBackupCode ? "Use authenticator code instead" : "Use a backup code instead"}
            </Button>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisable2FA}
              disabled={loading || !disableCode}
              className="bg-destructive hover:bg-destructive/90"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disable 2FA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate Backup Codes Dialog */}
      <AlertDialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Backup Codes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will invalidate all existing backup codes. Enter your authentication code to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="regenerate-code">Authentication Code</Label>
            <Input
              id="regenerate-code"
              placeholder="000000"
              value={regenerateCode}
              onChange={(e) => setRegenerateCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-2xl tracking-widest font-mono"
              maxLength={6}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerateBackupCodes} disabled={loading || regenerateCode.length !== 6}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View New Backup Codes Dialog */}
      <Dialog open={backupCodesOpen} onOpenChange={setBackupCodesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Backup Codes</DialogTitle>
            <DialogDescription>Save these codes safely. Your old codes are now invalid.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert className="border-amber-500/20 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-200">
                Save these codes now! You won&apos;t be able to see them again.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/50 p-4">
              {backupCodes.map((code, i) => (
                <code key={i} className="text-sm font-mono text-center py-1">
                  {code}
                </code>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => copyToClipboard(backupCodes.join("\n"), "backup")}
                className="flex-1"
              >
                {copiedBackup ? <Check className="mr-2 h-4 w-4 text-emerald-500" /> : <Copy className="mr-2 h-4 w-4" />}
                Copy
              </Button>
              <Button variant="outline" onClick={downloadBackupCodes} className="flex-1 bg-transparent">
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>

            <Button onClick={() => setBackupCodesOpen(false)} className="w-full">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

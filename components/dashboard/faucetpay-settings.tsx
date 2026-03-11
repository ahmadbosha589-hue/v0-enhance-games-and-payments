"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, CheckCircle, XCircle, ExternalLink, Mail, RefreshCw, Save } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

const faucetPaySchema = z.object({
  email: z.string().email("Please enter a valid email address"),
})

type FaucetPayFormData = z.infer<typeof faucetPaySchema>

interface FaucetPaySettingsProps {
  profile: {
    id: string
    faucetpay_email?: string | null
    faucetpay_verified?: boolean | null
  }
}

const FAUCETPAY_REFERRAL_LINK = "https://faucetpay.io/?r=5718151"

export function FaucetPaySettings({ profile }: FaucetPaySettingsProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "success" | "error">(
    profile.faucetpay_verified ? "success" : "idle",
  )
  const [isSaved, setIsSaved] = useState(!!profile.faucetpay_email)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    watch,
    reset,
  } = useForm<FaucetPayFormData>({
    resolver: zodResolver(faucetPaySchema),
    defaultValues: {
      email: profile.faucetpay_email || "",
    },
  })

  const currentEmail = watch("email")

  const onSubmit = async (data: FaucetPayFormData) => {
    setIsLoading(true)
    setVerificationStatus("idle")
    setErrorMessage(null)

    try {
      const response = await fetch("/api/faucetpay/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email.trim() }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to save email")
      }

      setIsSaved(true)
      reset({ email: data.email.trim().toLowerCase() })
      toast.success("FaucetPay email saved! Click 'Verify' to confirm your account.")
      router.refresh()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to save FaucetPay email"
      setErrorMessage(errorMsg)
      toast.error(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  const verifyFaucetPay = async () => {
    if (!currentEmail) {
      toast.error("Please enter and save your FaucetPay email first")
      return
    }

    if (isDirty) {
      toast.error("Please save your email first before verifying")
      return
    }

    setIsVerifying(true)
    setVerificationStatus("idle")
    setErrorMessage(null)

    try {
      const response = await fetch("/api/faucetpay/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentEmail.trim() }),
      })

      const result = await response.json()

      if (response.ok && result.success && result.verified) {
        setVerificationStatus("success")
        toast.success("FaucetPay account verified successfully!")
        router.refresh()
      } else {
        setVerificationStatus("error")
        setErrorMessage(result.error || "FaucetPay account not found. Please check the email address.")
        toast.error(result.error || "Verification failed")
      }
    } catch (error) {
      setVerificationStatus("error")
      setErrorMessage("Failed to connect to verification service. Please try again.")
      toast.error("Failed to verify FaucetPay account")
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Success Status */}
      {profile.faucetpay_verified && (
        <Alert className="border-green-500 bg-green-500/10">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-green-600 dark:text-green-400">
            Your FaucetPay account is verified and ready for withdrawals.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Enter the email address you used to register on FaucetPay. This must match exactly for withdrawals to work.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="faucetpay-email" className="flex items-center gap-2">
            FaucetPay Email
            {profile.faucetpay_verified && (
              <Badge variant="default" className="bg-green-500 text-xs">
                <CheckCircle className="mr-1 h-3 w-3" />
                Verified
              </Badge>
            )}
          </Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="faucetpay-email"
              type="email"
              placeholder="your@faucetpay-email.com"
              {...register("email")}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="outline"
                disabled={isLoading || !isDirty}
                className="flex-1 sm:flex-none bg-transparent"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-2">Save</span>
              </Button>
              <Button
                type="button"
                variant={verificationStatus === "success" ? "default" : "secondary"}
                onClick={verifyFaucetPay}
                disabled={isVerifying || !currentEmail || isDirty || !isSaved}
                className="flex-1 sm:flex-none"
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : verificationStatus === "success" ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">{verificationStatus === "success" ? "Verified" : "Verify"}</span>
              </Button>
            </div>
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          {isDirty && <p className="text-sm text-amber-500">You have unsaved changes. Click Save first.</p>}
        </div>

        {/* Error Message */}
        {errorMessage && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
      </form>

      {/* Help Text with updated referral link */}
      <div className="text-xs text-muted-foreground space-y-2 pt-3 border-t">
        <p className="font-medium">Don&apos;t have a FaucetPay account?</p>
        <Button variant="outline" size="sm" asChild className="w-full sm:w-auto bg-transparent">
          <a href={FAUCETPAY_REFERRAL_LINK} target="_blank" rel="noopener noreferrer">
            Create Free FaucetPay Account
            <ExternalLink className="ml-2 h-3 w-3" />
          </a>
        </Button>
        <p className="text-muted-foreground/80">
          <strong>Tip:</strong> Use the same email address you use when signing up for FaucetPay.
        </p>
      </div>
    </div>
  )
}

export default FaucetPaySettings

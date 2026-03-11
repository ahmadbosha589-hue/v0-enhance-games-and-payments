import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LogoFull } from "@/components/icons/logo"
import { AlertTriangle, ArrowLeft, Mail, Shield, Smartphone, Users, Ban } from "lucide-react"

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string }>
}) {
  const params = await searchParams
  const errorCode = params.error || "unknown"
  const errorDescription = params.error_description || "An unexpected authentication error occurred."

  const errorMessages: Record<
    string,
    { title: string; description: string; icon?: "mail" | "warning" | "shield" | "device" | "users" | "ban" }
  > = {
    gmail_only: {
      title: "Gmail Required",
      description:
        "Only Gmail addresses (@gmail.com) are allowed for security reasons. Please sign up with a Gmail account.",
      icon: "mail",
    },
    device_limit_exceeded: {
      title: "Device Limit Reached",
      description:
        "This device has reached the maximum number of accounts allowed. Only one account per device is permitted to prevent abuse.",
      icon: "device",
    },
    google_already_linked: {
      title: "Google Account Already Used",
      description:
        "This Google account is already linked to another user. Each Google account can only be used for one CryptoFaucet account.",
      icon: "users",
    },
    duplicate_google_account: {
      title: "Duplicate Google Account",
      description:
        "This Google account is already associated with another profile. Please use a different Google account or contact support.",
      icon: "users",
    },
    self_referral: {
      title: "Self-Referral Detected",
      description:
        "Self-referrals are not allowed. You cannot use your own referral link or refer accounts from the same device.",
      icon: "shield",
    },
    multiple_accounts: {
      title: "Multiple Accounts Detected",
      description:
        "Our system has detected multiple accounts associated with your device or network. Only one account per person is allowed.",
      icon: "shield",
    },
    banned_device: {
      title: "Device Banned",
      description: "This device has been associated with banned accounts and cannot be used to create new accounts.",
      icon: "ban",
    },
    auth_failed: {
      title: "Authentication Failed",
      description: "Failed to authenticate with Google. Please try again.",
      icon: "warning",
    },
    access_denied: {
      title: "Access Denied",
      description: "Access was denied. Please try again.",
      icon: "warning",
    },
    invalid_code: {
      title: "Invalid Code",
      description: "The authentication code is invalid or has expired. Please try signing in again.",
      icon: "warning",
    },
    invalid_request: {
      title: "Invalid Request",
      description: "Invalid request. Please try signing in again.",
      icon: "warning",
    },
    unauthorized_client: {
      title: "Unauthorized",
      description: "Unauthorized client. Please contact support.",
      icon: "shield",
    },
    server_error: {
      title: "Server Error",
      description: "Server error. Please try again later.",
      icon: "warning",
    },
    temporarily_unavailable: {
      title: "Service Unavailable",
      description: "Service temporarily unavailable. Please try again later.",
      icon: "warning",
    },
    unknown: {
      title: "Authentication Error",
      description: "An unexpected error occurred. Please try again.",
      icon: "warning",
    },
  }

  const errorInfo = errorMessages[errorCode] || {
    title: "Authentication Error",
    description: errorDescription,
    icon: "warning",
  }

  const getIcon = () => {
    switch (errorInfo.icon) {
      case "mail":
        return <Mail className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
      case "shield":
        return <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
      case "device":
        return <Smartphone className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
      case "users":
        return <Users className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
      case "ban":
        return <Ban className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
      default:
        return <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
    }
  }

  const getIconBgColor = () => {
    return errorInfo.icon === "mail" ? "bg-primary/10" : "bg-destructive/10"
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-6 md:p-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/4 top-1/4 h-[300px] w-[300px] sm:h-[400px] sm:w-[400px] rounded-full bg-destructive/10 blur-3xl" />
      </div>

      <div className="mb-6 sm:mb-8">
        <Link href="/" aria-label="Go to homepage">
          <LogoFull size="lg" />
        </Link>
      </div>

      <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center px-4 sm:px-6 pt-4 sm:pt-6">
          <div
            className={`mx-auto mb-3 sm:mb-4 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full ${getIconBgColor()}`}
          >
            {getIcon()}
          </div>
          <CardTitle className="text-xl sm:text-2xl">{errorInfo.title}</CardTitle>
          <CardDescription className="text-sm sm:text-base">{errorInfo.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
          {errorCode !== "unknown" && errorCode !== "gmail_only" && (
            <div className="rounded-lg border border-border bg-muted/50 p-2.5 sm:p-3 text-center">
              <p className="text-xs text-muted-foreground">Error code: {errorCode}</p>
            </div>
          )}

          {errorCode === "gmail_only" && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 sm:p-3 text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Create a free Gmail account at{" "}
                <a
                  href="https://accounts.google.com/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  accounts.google.com
                </a>
              </p>
            </div>
          )}

          {(errorCode === "device_limit_exceeded" ||
            errorCode === "multiple_accounts" ||
            errorCode === "google_already_linked" ||
            errorCode === "duplicate_google_account" ||
            errorCode === "banned_device") && (
            <div className="rounded-lg border border-chart-3/20 bg-chart-3/5 p-2.5 sm:p-3 text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">
                If you believe this is an error, please{" "}
                <Link href="/contact" className="text-primary hover:underline">
                  contact support
                </Link>{" "}
                for assistance.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button asChild className="h-10 sm:h-11 text-sm sm:text-base">
              <Link href="/auth/login">Try Again</Link>
            </Button>
            <Button variant="outline" asChild className="h-10 sm:h-11 text-sm sm:text-base bg-transparent">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

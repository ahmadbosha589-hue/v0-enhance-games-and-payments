import { getUser, getProfile } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ProfileSettings } from "@/components/dashboard/profile-settings"
import { FaucetPaySettings } from "@/components/dashboard/faucetpay-settings"
import { SecuritySettings } from "@/components/dashboard/security-settings"
import { User, Wallet, Shield, AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import Link from "next/link"

function ProfileErrorState() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unable to Load Settings</AlertTitle>
        <AlertDescription>
          <p className="mb-3">We couldn&apos;t load your profile data. Please try again.</p>
          <Button size="sm" asChild>
            <Link href="/dashboard/settings">Refresh Page</Link>
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}

export default async function SettingsPage() {
  const user = await getUser()

  if (!user) redirect("/auth/login?redirect=/dashboard/settings")

  const profile = await getProfile(user.id)

  if (!profile) {
    return <ProfileErrorState />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      <div className="space-y-4 sm:space-y-6">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <User className="h-5 w-5" />
              Profile
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Update your profile information</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileSettings profile={profile} email={user.email || ""} />
          </CardContent>
        </Card>

        {/* FaucetPay Settings - Now passing profile object with required fields */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Wallet className="h-5 w-5" />
              FaucetPay Withdrawal
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Configure your withdrawal destination</CardDescription>
          </CardHeader>
          <CardContent>
            <FaucetPaySettings
              profile={{
                id: profile.id,
                faucetpay_email: profile.faucetpay_email,
                faucetpay_verified: profile.faucetpay_verified,
              }}
            />
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Manage your account security</CardDescription>
          </CardHeader>
          <CardContent>
            <SecuritySettings profile={profile} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

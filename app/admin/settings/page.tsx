import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SystemSettingsForm } from "@/components/admin/system-settings-form"
import { Coins, CreditCard, Shield } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function AdminSettingsPage() {
  const supabase = await createClient()

  // Get current settings
  const { data: settings } = await supabase.from("system_settings").select("*")

  const settingsMap =
    settings?.reduce(
      (acc, s) => {
        acc[s.key] = s.value
        return acc
      },
      {} as Record<string, unknown>,
    ) || {}

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground">Configure platform parameters and limits</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Claim Settings
            </CardTitle>
            <CardDescription>Configure claim amounts and cooldowns</CardDescription>
          </CardHeader>
          <CardContent>
            <SystemSettingsForm category="claim" settings={settingsMap} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Withdrawal Settings
            </CardTitle>
            <CardDescription>Configure withdrawal limits and fees</CardDescription>
          </CardHeader>
          <CardContent>
            <SystemSettingsForm category="withdrawal" settings={settingsMap} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Settings
            </CardTitle>
            <CardDescription>Configure fraud detection thresholds</CardDescription>
          </CardHeader>
          <CardContent>
            <SystemSettingsForm category="security" settings={settingsMap} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

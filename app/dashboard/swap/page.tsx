import { getUser, getProfile } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CryptoSwap } from "@/components/dashboard/crypto-swap"
import { Card, CardContent } from "@/components/ui/card"
import { formatSatoshisDisplay } from "@/lib/utils/format"
import { Wallet, TrendingUp, ArrowDownUp, Shield } from "lucide-react"

export default async function SwapPage() {
  const user = await getUser()

  if (!user) redirect("/auth/login?redirect=/dashboard/swap")

  const profile = await getProfile(user.id)

  if (!profile) {
    redirect("/dashboard")
  }

  const features = [
    { icon: TrendingUp, text: "Best Rates", description: "Competitive exchange rates" },
    { icon: Shield, text: "Secure", description: "Protected transactions" },
    { icon: ArrowDownUp, text: "Instant", description: "Fast swaps" },
  ]

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ArrowDownUp className="h-7 w-7 text-primary" />
            Crypto Swap
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Instantly exchange between cryptocurrencies
          </p>
        </div>
      </div>

      {/* Feature Badges */}
      <div className="flex flex-wrap gap-4">
        {features.map((feature) => (
          <div
            key={feature.text}
            className="flex items-center gap-2 rounded-lg border bg-card p-3"
          >
            <div className="p-2 rounded-lg bg-primary/10">
              <feature.icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{feature.text}</p>
              <p className="text-xs text-muted-foreground">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Balance Card */}
        <Card className="lg:col-span-1 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Your Balance</p>
                <p className="text-2xl font-bold">{formatSatoshisDisplay(profile.balance_satoshis)}</p>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <div className="text-sm">
                <p className="text-muted-foreground mb-2">Supported Cryptocurrencies</p>
                <div className="flex flex-wrap gap-2">
                  {["BTC", "ETH", "USDT", "LTC", "BNB", "XRP", "DOGE", "SOL"].map((coin) => (
                    <span
                      key={coin}
                      className="px-2 py-1 bg-muted rounded text-xs font-mono"
                    >
                      {coin}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Swap Interface */}
        <div className="lg:col-span-2">
          <CryptoSwap />
        </div>
      </div>
    </div>
  )
}

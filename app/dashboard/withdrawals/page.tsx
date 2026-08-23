import { getUser, getProfile, safeQuery } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WithdrawalForm } from "@/components/dashboard/withdrawal-form"
import { WithdrawalHistory } from "@/components/dashboard/withdrawal-history"
import { CCPaymentWithdrawalForm } from "@/components/dashboard/ccpayment-withdrawal-form"
import { FaucetPayDeposit } from "@/components/dashboard/faucetpay-deposit"
import { WITHDRAWAL_CONFIG } from "@/lib/constants/config"
import { formatSatoshisDisplay } from "@/lib/utils/format"
import { Wallet, AlertCircle, Info, Shield, Zap, Bitcoin, CreditCard } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"

function ProfileErrorState() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Withdrawals</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Withdraw your earnings to FaucetPay</p>
      </div>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unable to Load Profile</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>We couldn&apos;t load your profile data. This might be due to a temporary connection issue.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button size="sm" asChild>
              <Link href="/dashboard/withdrawals">Try Again</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  )
}

export default async function WithdrawalsPage() {
  const user = await getUser()

  if (!user) redirect("/auth/login?redirect=/dashboard/withdrawals")

  const profile = await getProfile(user.id)

  if (!profile) {
    return <ProfileErrorState />
  }

  const withdrawals = await safeQuery(
    (supabase) =>
      supabase
        .from("withdrawals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
    [],
  )

  const canWithdraw = profile.balance_satoshis >= WITHDRAWAL_CONFIG.minimumSatoshis
  const hasFaucetPay = profile.faucetpay_email && profile.faucetpay_verified

  const features = [
    { icon: Zap, text: "Instant Processing" },
    { icon: Shield, text: "Secure & Verified" },
    { icon: Info, text: "Low Fees" },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Withdrawals</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Withdraw your earnings to FaucetPay</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {features.map((feature) => (
            <div key={feature.text} className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
              <feature.icon className="h-3.5 w-3.5 text-primary" />
              <span>{feature.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* FaucetPay Alert */}
      {!hasFaucetPay && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-amber-600 dark:text-amber-400">FaucetPay not configured</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-sm">Set up your FaucetPay email in settings to enable withdrawals.</span>
            <Button
              size="sm"
              variant="outline"
              asChild
              className="w-fit bg-transparent border-amber-500/50 hover:bg-amber-500/10"
            >
              <Link href="/dashboard/settings">Setup Now</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Withdrawal Methods Tabs */}
      <Tabs defaultValue="faucetpay" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="faucetpay" className="gap-2">
            <CreditCard className="h-4 w-4" />
            FaucetPay
          </TabsTrigger>
          <TabsTrigger value="ccpayment" className="gap-2">
            <Bitcoin className="h-4 w-4" />
            CCPayment
          </TabsTrigger>
        </TabsList>

        {/* FaucetPay Tab */}
        <TabsContent value="faucetpay" className="space-y-6">
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
            {/* Balance Card */}
            <Card className="lg:col-span-1 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Wallet className="h-4 w-4 text-primary" />
                  </div>
                  Available Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-3xl sm:text-4xl font-bold tracking-tight">
                      {formatSatoshisDisplay(profile.balance_satoshis)}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                      Min. withdrawal: {formatSatoshisDisplay(WITHDRAWAL_CONFIG.minimumSatoshis)}
                    </p>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-muted-foreground">Daily Limit</span>
                      <span className="font-medium">{formatSatoshisDisplay(WITHDRAWAL_CONFIG.dailyLimitSatoshis)}</span>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-muted-foreground">Network Fee</span>
                      <span className="font-medium">{WITHDRAWAL_CONFIG.feePercentage}%</span>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-muted-foreground">Processing</span>
                      <span className="font-medium text-green-500">Instant</span>
                    </div>
                  </div>

                  {!canWithdraw && (
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        You need{" "}
                        {formatSatoshisDisplay(WITHDRAWAL_CONFIG.minimumSatoshis - Number(profile.balance_satoshis))} more
                        to withdraw
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

              {/* FaucetPay Deposit — top up balance from an external wallet */}
              <FaucetPayDeposit />
            

            {/* Withdrawal Form */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg">Request Withdrawal</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Enter the amount you want to withdraw to FaucetPay
                </CardDescription>
              </CardHeader>
              <CardContent>
                <WithdrawalForm profile={profile} canWithdraw={canWithdraw && !!hasFaucetPay} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* CCPayment Tab */}
        <TabsContent value="ccpayment" className="space-y-6">
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
            {/* Balance Card */}
            <Card className="lg:col-span-1 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
                    <Bitcoin className="h-4 w-4 text-orange-500" />
                  </div>
                  Crypto Withdrawal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-3xl sm:text-4xl font-bold tracking-tight">
                      {formatSatoshisDisplay(profile.balance_satoshis)}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                      Withdraw to 50+ cryptocurrencies
                    </p>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-muted-foreground">Min. Withdrawal</span>
                      <span className="font-medium">10,000 sats</span>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-muted-foreground">Networks</span>
                      <span className="font-medium">BTC, ETH, TRC20, etc.</span>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-muted-foreground">Processing</span>
                      <span className="font-medium text-green-500">1-30 min</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {["BTC", "ETH", "USDT", "SOL", "XRP", "DOGE"].map((coin) => (
                      <span
                        key={coin}
                        className="px-2 py-0.5 bg-muted rounded text-xs font-mono"
                      >
                        {coin}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CCPayment Withdrawal Form */}
            <div className="lg:col-span-2">
              <CCPaymentWithdrawalForm profile={profile} canWithdraw={canWithdraw} />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Withdrawal History */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Withdrawal History</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Your recent withdrawal requests</CardDescription>
            </div>
            {withdrawals.length > 0 && (
              <Button variant="ghost" size="sm" asChild className="w-fit">
                <Link href="/dashboard/history?type=withdrawal">View All</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <WithdrawalHistory withdrawals={withdrawals} />
        </CardContent>
      </Card>
    </div>
  )
}

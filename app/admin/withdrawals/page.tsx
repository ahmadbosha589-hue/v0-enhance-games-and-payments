import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WithdrawalsTable } from "@/components/admin/withdrawals-table"
import { WithdrawalsFilters } from "@/components/admin/withdrawals-filters"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Clock, CheckCircle, Loader2, AlertTriangle, TrendingUp } from "lucide-react"

export const dynamic = "force-dynamic"

interface WithdrawalsPageProps {
  searchParams: Promise<{
    userId?: string
    referralId?: string
    minAmount?: string
    maxAmount?: string
    minFraudScore?: string
    maxFraudScore?: string
    flagged?: string
    currency?: string
    tab?: string
  }>
}

export default async function WithdrawalsPage({ searchParams }: WithdrawalsPageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const activeTab = params.tab || "pending"

  // Build base query with filters
  const buildQuery = (status: string | string[]) => {
    let query = supabase.from("withdrawals").select(`
        *,
        profiles!withdrawals_user_id_fkey (
          id,
          username,
          display_name,
          fraud_score,
          is_flagged,
          faucetpay_email,
          referral_code,
          referred_by,
          total_claims,
          balance_satoshis
        )
      `)

    // Status filter
    if (Array.isArray(status)) {
      query = query.in("status", status)
    } else {
      query = query.eq("status", status)
    }

    if (params.userId) {
      query = query.eq("user_id", params.userId)
    }

    if (params.referralId) {
      query = query.eq("profiles.referred_by", params.referralId)
    }

    if (params.minAmount) {
      query = query.gte("amount_satoshis", Number.parseInt(params.minAmount))
    }
    if (params.maxAmount) {
      query = query.lte("amount_satoshis", Number.parseInt(params.maxAmount))
    }

    if (params.minFraudScore) {
      query = query.gte("fraud_score", Number.parseInt(params.minFraudScore))
    }
    if (params.maxFraudScore) {
      query = query.lte("fraud_score", Number.parseInt(params.maxFraudScore))
    }

    if (params.flagged === "true") {
      query = query.eq("is_flagged", true)
    } else if (params.flagged === "false") {
      query = query.eq("is_flagged", false)
    }

    if (params.currency && params.currency !== "all") {
      query = query.eq("payment_currency", params.currency)
    }

    return query.order("created_at", { ascending: status === "pending" })
  }

  // Fetch data for all tabs
  const [
    { data: pendingWithdrawals, count: pendingCount },
    { data: processingWithdrawals, count: processingCount },
    { data: recentWithdrawals, count: recentCount },
    { data: flaggedWithdrawals, count: flaggedCount },
  ] = await Promise.all([
    buildQuery("pending").select("*", { count: "exact" }),
    buildQuery("processing").select("*", { count: "exact" }),
    buildQuery(["completed", "failed", "rejected"]).limit(100).select("*", { count: "exact" }),
    supabase
      .from("withdrawals")
      .select("*", { count: "exact" })
      .eq("is_flagged", true)
      .in("status", ["pending", "processing"]),
  ])

  // Calculate stats
  const totalPendingAmount = pendingWithdrawals?.reduce((sum, w) => sum + (w.amount_satoshis || 0), 0) || 0
  const avgFraudScore = pendingWithdrawals?.length
    ? Math.round(pendingWithdrawals.reduce((sum, w) => sum + (w.fraud_score || 0), 0) / pendingWithdrawals.length)
    : 0

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Withdrawals Management</h1>
        <p className="text-sm text-muted-foreground">
          Review, approve, and manage withdrawal requests with advanced filtering
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Pending</p>
                <p className="text-lg sm:text-2xl font-bold text-amber-500">{pendingCount || 0}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  {(totalPendingAmount / 100000000).toFixed(4)} BTC
                </p>
              </div>
              <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Processing</p>
                <p className="text-lg sm:text-2xl font-bold text-blue-500">{processingCount || 0}</p>
              </div>
              <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Flagged</p>
                <p className="text-lg sm:text-2xl font-bold text-red-500">{flaggedCount || 0}</p>
              </div>
              <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Avg Fraud Score</p>
                <p
                  className={`text-lg sm:text-2xl font-bold ${
                    avgFraudScore >= 70 ? "text-red-500" : avgFraudScore >= 40 ? "text-amber-500" : "text-emerald-500"
                  }`}
                >
                  {avgFraudScore}
                </p>
              </div>
              <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Advanced Filters</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Filter withdrawals by user, referrer, amount, and fraud indicators
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WithdrawalsFilters />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue={activeTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger
            value="pending"
            className="text-xs sm:text-sm py-2 px-1 sm:px-3 data-[state=active]:bg-amber-500/20"
          >
            <span className="hidden sm:inline">Pending</span>
            <span className="sm:hidden">Pend</span>
            <Badge variant="secondary" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
              {pendingCount || 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="processing"
            className="text-xs sm:text-sm py-2 px-1 sm:px-3 data-[state=active]:bg-blue-500/20"
          >
            <span className="hidden sm:inline">Processing</span>
            <span className="sm:hidden">Proc</span>
            <Badge variant="secondary" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
              {processingCount || 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="flagged"
            className="text-xs sm:text-sm py-2 px-1 sm:px-3 data-[state=active]:bg-red-500/20"
          >
            <span className="hidden sm:inline">Flagged</span>
            <span className="sm:hidden">Flag</span>
            <Badge variant="destructive" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
              {flaggedCount || 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm py-2 px-1 sm:px-3">
            <span className="hidden sm:inline">History</span>
            <span className="sm:hidden">Hist</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
                Pending Withdrawals
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Review and approve withdrawal requests</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              <WithdrawalsTable withdrawals={pendingWithdrawals || []} showActions showFraudDetails />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processing">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 animate-spin" />
                Processing Withdrawals
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Withdrawals being sent to FaucetPay</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              <WithdrawalsTable withdrawals={processingWithdrawals || []} showFraudDetails />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flagged">
          <Card className="border-red-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-red-500">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
                Flagged Withdrawals
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Withdrawals requiring manual review due to fraud indicators
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              <WithdrawalsTable
                withdrawals={(pendingWithdrawals || []).filter((w) => w.is_flagged)}
                showActions
                showFraudDetails
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500" />
                Withdrawal History
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Recently completed, failed, or rejected withdrawals
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              <WithdrawalsTable withdrawals={recentWithdrawals || []} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

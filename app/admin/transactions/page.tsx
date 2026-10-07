import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowUpRight, ArrowDownRight, Gift, Users, Zap, FileText, Search, Trophy } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { formatDistanceToNow } from "date-fns"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

interface TransactionsPageProps {
  searchParams: Promise<{
    tab?: string
    search?: string
  }>
}

const typeIcons: Record<string, React.ReactNode> = {
  claim: <Zap className="h-4 w-4 text-amber-500" />,
  withdrawal: <ArrowUpRight className="h-4 w-4 text-red-500" />,
  referral_bonus: <Users className="h-4 w-4 text-blue-500" />,
  bonus: <Gift className="h-4 w-4 text-green-500" />,
  daily_bonus: <Gift className="h-4 w-4 text-purple-500" />,
  streak_bonus: <Gift className="h-4 w-4 text-orange-500" />,
  signup_bonus: <Gift className="h-4 w-4 text-cyan-500" />,
  achievement: <Trophy className="h-4 w-4 text-yellow-500" />,
  adjustment: <FileText className="h-4 w-4 text-muted-foreground" />,
  ptc: <Zap className="h-4 w-4 text-green-500" />,
  game_reward: <Trophy className="h-4 w-4 text-blue-500" />,
}

const typeLabels: Record<string, string> = {
  claim: "Faucet Claim",
  withdrawal: "Withdrawal",
  referral_bonus: "Referral Bonus",
  bonus: "Bonus",
  daily_bonus: "Daily Bonus",
  streak_bonus: "Streak Bonus",
  signup_bonus: "Signup Bonus",
  achievement: "Achievement",
  adjustment: "Adjustment",
  ptc: "PTC Ad View",
  game_reward: "Game Reward",
}

async function searchAction(formData: FormData) {
  "use server"
  const search = formData.get("search") as string
  if (search) {
    redirect(`/admin/transactions?search=${encodeURIComponent(search)}`)
  } else {
    redirect("/admin/transactions")
  }
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const activeTab = params.tab || "all"

  if (!supabase) {
    return <div className="p-6 text-muted-foreground">Database is not configured.</div>
  }

  const buildQuery = (type?: string) => {
    let query = supabase.from("transactions").select(
      `
      *,
      profiles:user_id (
        id,
        username,
        display_name
      )
    `,
      { count: "exact" },
    )

    if (type && type !== "all") {
      if (type === "bonus") {
        // The 'bonus' type in DB covers: daily_bonus, streak_bonus, signup_bonus, referral_bonus
        query = query.in("type", ["bonus", "daily_bonus", "streak_bonus", "signup_bonus", "referral_bonus"])
      } else if (type === "achievement") {
        query = query.eq("type", "achievement")
      } else {
        query = query.eq("type", type)
      }
    }

    if (params.search) {
      query = query.or(`description.ilike.%${params.search}%,user_id.eq.${params.search}`)
    }

    return query.order("created_at", { ascending: false }).limit(100)
  }

  const [
    { data: allTransactions, count: allCount, error: allError },
    { data: claimTransactions, count: claimCount },
    { data: withdrawalTransactions, count: withdrawalCount },
    { data: bonusTransactions, count: bonusCount },
    { data: achievementTransactions, count: achievementCount },
  ] = await Promise.all([
    buildQuery(),
    buildQuery("claim"),
    buildQuery("withdrawal"),
    buildQuery("bonus"),
    supabase
      .from("transactions")
      .select(
        `
      *,
      profiles:user_id (
        id,
        username,
        display_name
      )
    `,
        { count: "exact" },
      )
      .eq("type", "achievement")
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  // Calculate stats
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayTransactions = allTransactions?.filter((t) => new Date(t.created_at) >= todayStart) || []

  const totalClaimsToday = todayTransactions
    .filter((t) => t.type === "claim")
    .reduce((sum, t) => sum + (t.amount_satoshis || 0), 0)

  const totalWithdrawalsToday = todayTransactions
    .filter((t) => t.type === "withdrawal")
    .reduce((sum, t) => sum + Math.abs(t.amount_satoshis || 0), 0)

  const totalBonusesToday = todayTransactions
    .filter((t) => ["bonus", "daily_bonus", "streak_bonus", "signup_bonus", "referral_bonus"].includes(t.type))
    .reduce((sum, t) => sum + (t.amount_satoshis || 0), 0)

  const renderTransactionsTable = (transactions: typeof allTransactions) => {
    if (!transactions || transactions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mb-4 opacity-50" />
          <p>No transactions found</p>
        </div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {typeIcons[transaction.type] || <FileText className="h-4 w-4" />}
                    <span className="text-sm">{typeLabels[transaction.type] || transaction.type}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">
                      {transaction.profiles?.username || transaction.profiles?.display_name || "Unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {transaction.user_id?.slice(0, 8)}...
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    className={`flex items-center gap-1 font-mono text-sm ${transaction.amount_satoshis >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                  >
                    {transaction.amount_satoshis >= 0 ? (
                      <ArrowDownRight className="h-3 w-3" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3" />
                    )}
                    {Math.abs(transaction.amount_satoshis).toLocaleString()} sats
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      transaction.status === "completed"
                        ? "default"
                        : transaction.status === "pending"
                          ? "secondary"
                          : "destructive"
                    }
                    className="text-xs"
                  >
                    {transaction.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
                    {transaction.description || "-"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(transaction.created_at), { addSuffix: true })}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          View all platform transactions including claims, withdrawals, bonuses, and achievements
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Claims Today</p>
                <p className="text-lg sm:text-2xl font-bold text-amber-500">{totalClaimsToday.toLocaleString()}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">satoshis</p>
              </div>
              <Zap className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Withdrawals Today</p>
                <p className="text-lg sm:text-2xl font-bold text-red-500">{totalWithdrawalsToday.toLocaleString()}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">satoshis</p>
              </div>
              <ArrowUpRight className="h-6 w-6 sm:h-8 sm:w-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Bonuses Today</p>
                <p className="text-lg sm:text-2xl font-bold text-green-500">{totalBonusesToday.toLocaleString()}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">satoshis</p>
              </div>
              <Gift className="h-6 w-6 sm:h-8 sm:w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total Today</p>
                <p className="text-lg sm:text-2xl font-bold text-blue-500">{todayTransactions.length}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">transactions</p>
              </div>
              <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <form action={searchAction} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Search by description or user ID..."
                defaultValue={params.search}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="default" size="icon" className="shrink-0">
              <Search className="h-4 w-4" />
            </Button>
            {params.search && (
              <Button type="button" variant="outline" size="sm" asChild>
                <a href="/admin/transactions">Clear</a>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue={activeTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 h-auto">
          <TabsTrigger value="all" className="text-xs sm:text-sm py-2">
            All
            <Badge variant="secondary" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
              {allCount ?? 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="claims" className="text-xs sm:text-sm py-2">
            Claims
            <Badge variant="secondary" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
              {claimCount ?? 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="text-xs sm:text-sm py-2">
            Withdrawals
            <Badge variant="secondary" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
              {withdrawalCount ?? 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="bonuses" className="text-xs sm:text-sm py-2">
            Bonuses
            <Badge variant="secondary" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
              {bonusCount ?? 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="achievements" className="text-xs sm:text-sm py-2">
            Achievements
            <Badge variant="secondary" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
              {achievementCount ?? 0}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                All Transactions
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Complete transaction history</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">{renderTransactionsTable(allTransactions)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="claims">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
                Faucet Claims
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">All faucet claim transactions</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">{renderTransactionsTable(claimTransactions)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
                Withdrawals
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">All withdrawal transactions</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">{renderTransactionsTable(withdrawalTransactions)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bonuses">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Gift className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
                Bonuses
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Referral bonuses, daily bonuses, streak bonuses, and other rewards
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">{renderTransactionsTable(bonusTransactions)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="achievements">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
                Achievement Rewards
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">All achievement reward claims</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">{renderTransactionsTable(achievementTransactions)}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

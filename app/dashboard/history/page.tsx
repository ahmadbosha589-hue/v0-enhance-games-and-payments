import { getUser, safeQuery } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TransactionHistory } from "@/components/dashboard/transaction-history"
import { History } from "lucide-react"

export default async function HistoryPage() {
  const user = await getUser()

  if (!user) redirect("/auth/login?redirect=/dashboard/history")

  const transactions = await safeQuery(
    (supabase) =>
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    [],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transaction History</h1>
        <p className="text-muted-foreground">View all your claims, withdrawals, and bonuses</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <History className="h-5 w-5" />
            All Transactions
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Your complete transaction history</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No transactions yet</p>
              <p className="text-sm">Start claiming to see your history</p>
            </div>
          ) : (
            <TransactionHistory transactions={transactions} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

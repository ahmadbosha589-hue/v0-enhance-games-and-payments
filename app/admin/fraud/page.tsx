import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FraudFlagsTable } from "@/components/admin/fraud-flags-table"
import { FraudScoreBreakdown } from "@/components/admin/fraud-score-breakdown"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertTriangle, AlertCircle, Info, Shield, Users, Activity } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function FraudPage() {
  const supabase = await createClient()

  // Fetch fraud flags with user profiles
  const { data: flags } = await supabase
    .from("fraud_flags")
    .select(`
      *,
      profiles!fraud_flags_user_id_fkey (
        id,
        username,
        display_name,
        fraud_score,
        status,
        banned_at,
        total_claims,
        referral_count,
        referred_by,
        created_at
      )
    `)
    .eq("status", "pending_review")
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false })

  // Fetch resolved flags for history
  const { data: resolvedFlags } = await supabase
    .from("fraud_flags")
    .select(`
      *,
      profiles!fraud_flags_user_id_fkey (
        username,
        display_name
      )
    `)
    .in("status", ["confirmed_fraud", "false_positive"])
    .order("resolved_at", { ascending: false })
    .limit(50)

  // Fetch high-risk users
  const { data: highRiskUsers } = await supabase
    .from("profiles")
    .select("*")
    .gte("fraud_score", 70)
    .eq("status", "active")
    .order("fraud_score", { ascending: false })
    .limit(20)

  // Calculate severity counts
  const criticalCount = flags?.filter((f) => f.severity >= 80).length || 0
  const highCount = flags?.filter((f) => f.severity >= 60 && f.severity < 80).length || 0
  const mediumCount = flags?.filter((f) => f.severity >= 40 && f.severity < 60).length || 0
  const lowCount = flags?.filter((f) => f.severity < 40).length || 0

  // Group flags by type
  const flagsByType =
    flags?.reduce(
      (acc, flag) => {
        acc[flag.fraud_type] = (acc[flag.fraud_type] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    ) || {}

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Fraud Detection Center</h1>
        <p className="text-sm text-muted-foreground">
          Monitor, review, and resolve fraud flags with advanced scoring system
        </p>
      </div>

      {/* Severity Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Critical</p>
                <p className="text-xl sm:text-3xl font-bold text-red-500">{criticalCount}</p>
                <p className="text-[10px] sm:text-xs text-red-400">Score 80-100</p>
              </div>
              <AlertTriangle className="h-8 w-8 sm:h-10 sm:w-10 text-red-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">High</p>
                <p className="text-xl sm:text-3xl font-bold text-orange-500">{highCount}</p>
                <p className="text-[10px] sm:text-xs text-orange-400">Score 60-79</p>
              </div>
              <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-orange-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Medium</p>
                <p className="text-xl sm:text-3xl font-bold text-amber-500">{mediumCount}</p>
                <p className="text-[10px] sm:text-xs text-amber-400">Score 40-59</p>
              </div>
              <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-amber-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Low</p>
                <p className="text-xl sm:text-3xl font-bold text-blue-500">{lowCount}</p>
                <p className="text-[10px] sm:text-xs text-blue-400">Score 0-39</p>
              </div>
              <Info className="h-8 w-8 sm:h-10 sm:w-10 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fraud Types Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
            Fraud Types Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(flagsByType).map(([type, count]) => (
              <Badge key={type} variant="outline" className="text-xs sm:text-sm py-1 px-2 sm:px-3">
                {type.replace(/_/g, " ")}: {String(count)}
              </Badge>
            ))}
            {Object.keys(flagsByType).length === 0 && (
              <p className="text-sm text-muted-foreground">No active fraud flags</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="pending" className="text-xs sm:text-sm py-2 data-[state=active]:bg-red-500/20">
            Pending Review
            <Badge variant="destructive" className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs">
              {flags?.length || 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="high-risk" className="text-xs sm:text-sm py-2 data-[state=active]:bg-amber-500/20">
            High Risk Users
            <Badge variant="secondary" className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs">
              {highRiskUsers?.length || 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm py-2">
            Resolution History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card className="border-red-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
                Pending Fraud Flags
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Review suspicious activity and take appropriate action
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              <FraudFlagsTable flags={flags || []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="high-risk">
          <Card className="border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
                High Risk Users
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Active users with fraud scores of 70 or higher
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              <FraudScoreBreakdown users={highRiskUsers || []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500" />
                Resolution History
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Recently resolved or dismissed fraud flags
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              <FraudFlagsTable flags={resolvedFlags || []} showResolution />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
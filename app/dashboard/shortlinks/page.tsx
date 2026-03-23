"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Link2,
  ExternalLink,
  Clock,
  Coins,
  CheckCircle,
  AlertCircle,
  Trophy,
  Zap,
  RefreshCw
} from "lucide-react"
import { createClient, getAuthUser } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/i18n/language-context"

interface Shortlink {
  id: string
  title: string
  destination_url: string
  reward_satoshis: number
  view_time_seconds: number
  is_active: boolean
}

interface ShortlinkVisit {
  id: string
  shortlink_id: string
  viewed_at: string
  reward_satoshis: number
  shortlinks: {
    title: string
  }
}

interface DailyProgress {
  total_earned: number
  links_completed: number
  max_links: number
}

export default function ShortlinksPage() {
  const { t } = useLanguage()
  const [shortlinks, setShortlinks] = useState<Shortlink[]>([])
  const [visitedToday, setVisitedToday] = useState<Set<string>>(new Set())
  const [activeLink, setActiveLink] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [dailyProgress, setDailyProgress] = useState<DailyProgress>({
    total_earned: 0,
    links_completed: 0,
    max_links: 20
  })
  const [recentVisits, setRecentVisits] = useState<ShortlinkVisit[]>([])
  const supabase = useMemo(() => createClient(), [])
  // Track when the user opened the link so the server can validate view duration
  const viewStartTimeRef = useRef<number | null>(null)

  const loadData = useCallback(async () => {
    try {
      // Guard: supabase client may be null when env vars are not configured
      if (!supabase) return

      const user = await getAuthUser()
      if (!user) return

      // Load shortlinks
      const { data: linksData } = await supabase
        .from("shortlinks")
        .select("*")
        .eq("is_active", true)
        .order("reward_satoshis", { ascending: false })

      if (linksData) {
        setShortlinks(linksData)
      }

      // Load today's visits
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const { data: visitsData } = await supabase
        .from("shortlink_views")
        .select("shortlink_id, reward_satoshis")
        .eq("user_id", user.id)
        .gte("viewed_at", today.toISOString())

      if (visitsData) {
        const visited = new Set(visitsData.map(v => v.shortlink_id))
        setVisitedToday(visited)
        setDailyProgress({
          total_earned: visitsData.reduce((sum, v) => sum + v.reward_satoshis, 0),
          links_completed: visitsData.length,
          max_links: 20
        })
      }

      // Load recent visits
      const { data: recentData } = await supabase
        .from("shortlink_views")
        .select(`
          id,
          shortlink_id,
          viewed_at,
          reward_satoshis,
          shortlinks (title)
        `)
        .eq("user_id", user.id)
        .order("viewed_at", { ascending: false })
        .limit(5)

      if (recentData) {
        setRecentVisits(recentData as unknown as ShortlinkVisit[])
      }
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  // completeVisit must be declared BEFORE the countdown effect that references it
  // (const/useCallback are in TDZ until their declaration line is reached)
  const completeVisit = useCallback(async (shortlinkId: string) => {
    try {
      // Build a lightweight fingerprint from browser properties for bot detection
      const fingerprint = btoa(
        [navigator.userAgent, navigator.language, screen.width, screen.height].join("|")
      ).slice(0, 32)

      const response = await fetch("/api/shortlinks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortlinkId,
          viewStartTime: viewStartTimeRef.current ?? Date.now(),
          fingerprint,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        console.error("Error completing shortlink visit:", err)
        return
      }

      // Update local state optimistically so the UI reflects the change instantly
      setVisitedToday(prev => new Set([...prev, shortlinkId]))
      const shortlink = shortlinks.find(s => s.id === shortlinkId)
      if (shortlink) {
        setDailyProgress(prev => ({
          ...prev,
          total_earned: prev.total_earned + shortlink.reward_satoshis,
          links_completed: prev.links_completed + 1,
        }))
      }

      // Sync fresh data from server in background
      loadData()
    } catch (error) {
      console.error("Error completing visit:", error)
    } finally {
      setActiveLink(null)
      setCountdown(0)
      viewStartTimeRef.current = null
    }
  }, [shortlinks, loadData])

  // Countdown timer — completeVisit must be in deps (stable ref via useCallback)
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0 && activeLink) {
      completeVisit(activeLink)
    }
  }, [countdown, activeLink, completeVisit])

  async function startVisit(shortlink: Shortlink) {
    if (visitedToday.has(shortlink.id) || activeLink) return

    // Record exactly when the user opened the link so the server can validate duration
    viewStartTimeRef.current = Date.now()

    // Open link in new tab
    window.open(shortlink.destination_url, "_blank")

    // Start countdown
    setActiveLink(shortlink.id)
    setCountdown(shortlink.view_time_seconds)
  }

  const availableLinks = shortlinks.filter(s => !visitedToday.has(s.id))
  const completedLinks = shortlinks.filter(s => visitedToday.has(s.id))

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 mb-4">
            <Link2 className="h-8 w-8 text-cyan-500" />
          </div>
          <h1 className="text-3xl font-bold text-white">Shortlinks</h1>
          <p className="text-gray-400 max-w-md mx-auto">
            Visit links for a few seconds to earn satoshis. Quick and easy!
          </p>
        </div>

        {/* Daily Progress */}
        <Card className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-cyan-500/20 flex items-center justify-center">
                  <Trophy className="h-7 w-7 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Today's Earnings</p>
                  <p className="text-2xl font-bold text-white">
                    {dailyProgress.total_earned} <span className="text-sm text-gray-400">satoshis</span>
                  </p>
                </div>
              </div>
              <div className="w-full md:w-64">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Links completed</span>
                  <span className="text-cyan-400">{dailyProgress.links_completed}/{dailyProgress.max_links}</span>
                </div>
                <Progress
                  value={(dailyProgress.links_completed / dailyProgress.max_links) * 100}
                  className="h-2 bg-gray-800"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Countdown */}
        {activeLink && countdown > 0 && (
          <Card className="bg-amber-500/10 border-amber-500/30 animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-amber-400 animate-spin" style={{ animationDuration: "3s" }} />
                  </div>
                  <div>
                    <p className="font-bold text-white">Please wait...</p>
                    <p className="text-sm text-gray-400">Keep the link tab open</p>
                  </div>
                </div>
                <div className="text-4xl font-bold text-amber-400 font-mono">
                  {countdown}s
                </div>
              </div>
              <Progress
                value={((shortlinks.find(s => s.id === activeLink)?.view_time_seconds || 10) - countdown) / (shortlinks.find(s => s.id === activeLink)?.view_time_seconds || 10) * 100}
                className="h-2 mt-4 bg-gray-800"
              />
            </CardContent>
          </Card>
        )}

        {/* Available Links */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Available Links ({availableLinks.length})
                </CardTitle>
                <CardDescription>
                  Click to visit and earn satoshis
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                className="border-gray-700"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
              </div>
            ) : availableLinks.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <p className="text-white font-medium">All done for today!</p>
                <p className="text-sm text-gray-400">Come back tomorrow for more links</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50 border border-gray-700 hover:border-cyan-500/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                        <ExternalLink className="h-5 w-5 text-cyan-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{link.title}</p>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <Clock className="h-3 w-3" />
                          <span>{link.view_time_seconds}s wait time</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        <Coins className="h-3 w-3 mr-1" />
                        +{link.reward_satoshis} sats
                      </Badge>
                      <Button
                        onClick={() => startVisit(link)}
                        disabled={activeLink !== null}
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white"
                      >
                        Visit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Links */}
        {completedLinks.length > 0 && (
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Completed Today ({completedLinks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {completedLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-white">{link.title}</span>
                    </div>
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      +{link.reward_satoshis} sats
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tips */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-400">
                <p className="font-medium text-blue-400 mb-1">Tips for earning more:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Visit all available links daily for maximum earnings</li>
                  <li>Keep the link tab open for the full duration</li>
                  <li>Links reset every 24 hours at midnight UTC</li>
                  <li>Higher reward links have longer wait times</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
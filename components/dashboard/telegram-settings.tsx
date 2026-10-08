"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Loader2, Copy, CheckCircle2, RefreshCw, ExternalLink, MessageCircle } from "lucide-react"
import { toast } from "sonner"

interface TelegramLinkData {
  linked: boolean
  chatId: string | null
  token: string | null
  botUsername: string
  deepLink: string | null
}

/**
 * Telegram account linking.
 *
 * Connects the user's Faucero account to the Telegram bot: generate a one-time
 * token, send /link <token> to the bot (or open the deep link), and the bot
 * links the chat. Once linked, the rewarded-ad flow (AdsGram) works inside
 * Telegram and the bot can show the balance.
 */
export function TelegramSettings() {
  const [data, setData] = useState<TelegramLinkData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [botUsername, setBotUsername] = useState("")

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/telegram/link")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load")
      setData(json)
      setBotUsername(json.botUsername || "faucero")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load Telegram settings")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const generateToken = async () => {
    setIsGenerating(true)
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to generate token")
      toast.success("Token generated", { description: json.message })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate token")
    } finally {
      setIsGenerating(false)
    }
  }

  const copy = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Copy failed"))
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading Telegram settings...</span>
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Telegram settings unavailable.</p>
      ) : data.linked ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium">Telegram connected</span>
            <Badge variant="secondary">chat {data.chatId}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Rewarded ads (AdsGram) work when Faucero is opened inside Telegram, and the bot can show your balance.
          </p>
          <div className="flex gap-2">
            {data.botUsername && (
              <Button variant="outline" size="sm" onClick={() => window.open(`https://t.me/${data.botUsername}`, "_blank")}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Open bot
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Telegram not connected</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Link your Telegram to use the bot and the rewarded-ad flow. Generate a token, then send{" "}
            <code className="mx-1 font-mono">{"/link <token>"}</code> to the bot — or open the deep link.
          </p>

          {data.token ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input value={data.token} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copy(data.token!)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {data.deepLink && (
                <Button className="w-full" onClick={() => window.open(data.deepLink!, "_blank")}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Telegram to link
                </Button>
              )}
            </div>
          ) : (
            <Button onClick={generateToken} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
              Generate link token
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={generateToken} disabled={isGenerating}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            New token
          </Button>
        </div>
      )}
    </div>
  )
}
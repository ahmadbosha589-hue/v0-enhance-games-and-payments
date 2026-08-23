"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Bitcoin, ExternalLink, Loader2, ArrowDownToLine, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

const COINS = [
  { id: "BTC", name: "Bitcoin" },
  { id: "ETH", name: "Ethereum" },
  { id: "LTC", name: "Litecoin" },
  { id: "USDT", name: "Tether" },
]

export function FaucetPayDeposit() {
  const [amount, setAmount] = useState("")
  const [coin, setCoin] = useState("BTC")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const start = async () => {
    const value = parseFloat(amount)
    if (!value || value < 0.01) {
      toast.error("Enter an amount of at least $0.01")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/deposit/faucetpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, currency: coin }),
      })
      const data = await res.json()

      if (!data.success || !data.merchantUrl) {
        toast.error(data.error || "Could not start the deposit")
        return
      }

      toast.info("Redirecting to FaucetPay…", {
        description: "Complete the payment there — your balance updates automatically after confirmation.",
      })
      // FaucetPay merchant checkout is a redirect flow.
      window.location.href = data.merchantUrl
    } catch {
      toast.error("Deposit failed to start")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <ArrowDownToLine className="h-4 w-4 text-primary" />
          </div>
          Deposit with FaucetPay
          <Badge variant="secondary" className="ml-auto text-[10px]">Instant</Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Pay from your FaucetPay wallet or any crypto address — credited automatically after confirmation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {done ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            Payment detected — your balance will update within a minute.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="fp-deposit-amount">Amount (USD)</Label>
              <Input
                id="fp-deposit-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="10.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="font-mono"
              />
              <div className="flex flex-wrap gap-2">
                {[5, 10, 25, 50, 100].map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={amount === v.toFixed(2) ? "secondary" : "outline"}
                    onClick={() => setAmount(v.toFixed(2))}
                  >
                    ${v}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pay with</Label>
              <div className="grid grid-cols-4 gap-2">
                {COINS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCoin(c.id)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-all ${
                      coin === c.id
                        ? "border-primary bg-primary/5 font-medium"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <Bitcoin className="h-3.5 w-3.5 text-primary" />
                    {c.id}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={start}
              disabled={loading || !amount || parseFloat(amount) < 0.01}
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" />
                  Deposit via FaucetPay
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

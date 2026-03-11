"use client"

import { useState, useEffect } from "react"
import type { Profile } from "@/lib/types/database"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { formatSatoshisDisplay } from "@/lib/utils/format"
import { Loader2, Wallet, AlertCircle, CheckCircle2, Info, Bitcoin } from "lucide-react"
import { toast } from "sonner"
import useSWR from "swr"
import { cn } from "@/lib/utils"

interface CCPaymentWithdrawalFormProps {
  profile: Profile
  canWithdraw: boolean
}

interface CoinInfo {
  coinId: string
  symbol: string
  name: string
  chains: Array<{
    chainId: string
    chainName: string
    minWithdrawAmount: string
    withdrawFee: string
  }>
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function CCPaymentWithdrawalForm({ profile, canWithdraw }: CCPaymentWithdrawalFormProps) {
  const [selectedCoin, setSelectedCoin] = useState("")
  const [selectedChain, setSelectedChain] = useState("")
  const [address, setAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: coinsData } = useSWR("/api/ccpayment/withdraw?coins=true", fetcher)
  const coins: CoinInfo[] = coinsData?.coins || []

  const selectedCoinInfo = coins.find(c => c.coinId === selectedCoin)
  const selectedChainInfo = selectedCoinInfo?.chains.find(c => c.chainId === selectedChain)

  const amountNum = parseInt(amount) || 0
  const minWithdraw = 10000 // Minimum 10,000 satoshis

  const getValidationErrors = (): string[] => {
    const errors: string[] = []
    
    if (!selectedCoin) errors.push("Select a cryptocurrency")
    if (!selectedChain) errors.push("Select a network/chain")
    if (!address || address.length < 10) errors.push("Enter a valid wallet address")
    if (amountNum < minWithdraw) errors.push(`Minimum withdrawal is ${minWithdraw.toLocaleString()} satoshis`)
    if (amountNum > Number(profile.balance_satoshis)) errors.push("Insufficient balance")
    if (profile.is_flagged && profile.fraud_score >= 50) {
      errors.push("Account under review - withdrawals temporarily disabled")
    }
    
    return errors
  }

  const validationErrors = getValidationErrors()
  const isValid = validationErrors.length === 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isValid || !canWithdraw) return

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/ccpayment/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coinId: selectedCoin,
          chain: selectedChain,
          address,
          amountSatoshis: amountNum
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to process withdrawal")
      }

      toast.success("Withdrawal submitted!", {
        description: `${amountNum.toLocaleString()} satoshis will be sent to your ${selectedCoin} wallet`
      })

      // Reset form
      setAmount("")
      setAddress("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Withdrawal failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bitcoin className="h-5 w-5 text-orange-500" />
          Crypto Withdrawal
        </CardTitle>
        <CardDescription>
          Withdraw your balance directly to any cryptocurrency wallet via CCPayment
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cryptocurrency Selection */}
          <div className="space-y-2">
            <Label>Cryptocurrency</Label>
            <Select value={selectedCoin} onValueChange={(v) => {
              setSelectedCoin(v)
              setSelectedChain("")
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select cryptocurrency" />
              </SelectTrigger>
              <SelectContent>
                {coins.map(coin => (
                  <SelectItem key={coin.coinId} value={coin.coinId}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{coin.symbol}</span>
                      <span className="text-muted-foreground text-sm">{coin.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chain/Network Selection */}
          {selectedCoinInfo && (
            <div className="space-y-2">
              <Label>Network</Label>
              <Select value={selectedChain} onValueChange={setSelectedChain}>
                <SelectTrigger>
                  <SelectValue placeholder="Select network" />
                </SelectTrigger>
                <SelectContent>
                  {selectedCoinInfo.chains.map(chain => (
                    <SelectItem key={chain.chainId} value={chain.chainId}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>{chain.chainName}</span>
                        <span className="text-xs text-muted-foreground">
                          Fee: {chain.withdrawFee}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Wallet Address */}
          <div className="space-y-2">
            <Label>Wallet Address</Label>
            <Input
              placeholder={`Enter your ${selectedCoin || "crypto"} wallet address`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label>Amount (Satoshis)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={minWithdraw}
                max={Number(profile.balance_satoshis)}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setAmount(profile.balance_satoshis.toString())}
              >
                Max
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Available: {formatSatoshisDisplay(profile.balance_satoshis)} | 
              Min: {minWithdraw.toLocaleString()} sats
            </p>
          </div>

          {/* Chain Info */}
          {selectedChainInfo && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network Fee</span>
                <span className="font-mono">{selectedChainInfo.withdrawFee} {selectedCoin}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Min. Withdrawal</span>
                <span className="font-mono">{selectedChainInfo.minWithdrawAmount} {selectedCoin}</span>
              </div>
            </div>
          )}

          {/* Validation Errors */}
          {validationErrors.length > 0 && amountNum > 0 && (
            <div className="space-y-1">
              {validationErrors.map((error, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ))}
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={!isValid || !canWithdraw || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                Withdraw to {selectedCoin || "Crypto"}
              </>
            )}
          </Button>

          {/* Info */}
          <p className="text-xs text-center text-muted-foreground">
            Withdrawals are processed within 1-24 hours depending on network congestion
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

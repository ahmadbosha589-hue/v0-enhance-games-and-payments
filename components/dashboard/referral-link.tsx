"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy, Check, Share2, Twitter, MessageCircle, Send } from "lucide-react"
import { toast } from "sonner"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { QRCodeSVG } from "qrcode.react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { PLATFORM_CONFIG } from "@/lib/constants/config"

interface ReferralLinkProps {
  referralCode: string
}

export function ReferralLink({ referralCode }: ReferralLinkProps) {
  const [copied, setCopied] = useState(false)

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "https://cryptofaucet.com"
  const referralUrl = `${baseUrl}/auth/sign-up?ref=${referralCode}`

  const shareText = `Join ${PLATFORM_CONFIG.name} and earn free Bitcoin every 5 minutes! Use my referral link:`

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      toast.success("Link copied to clipboard!")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy link")
    }
  }

  const shareToTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(referralUrl)}`
    window.open(url, "_blank", "width=600,height=400")
  }

  const shareToTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(shareText)}`
    window.open(url, "_blank", "width=600,height=400")
  }

  const shareToWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralUrl}`)}`
    window.open(url, "_blank", "width=600,height=400")
  }

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${PLATFORM_CONFIG.name}`,
          text: shareText,
          url: referralUrl,
        })
      } catch {
        // User cancelled
      }
    } else {
      copyToClipboard()
    }
  }

  return (
    <div className="space-y-6">
      {/* Link Input */}
      <div className="flex gap-2">
        <Input value={referralUrl} readOnly className="font-mono text-sm bg-muted/50" />
        <Button variant="outline" size="icon" onClick={copyToClipboard} className="shrink-0 bg-transparent">
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>

      {/* Share Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={shareToTwitter} className="gap-2 bg-transparent">
          <Twitter className="h-4 w-4" />
          Twitter
        </Button>
        <Button variant="outline" size="sm" onClick={shareToTelegram} className="gap-2 bg-transparent">
          <Send className="h-4 w-4" />
          Telegram
        </Button>
        <Button variant="outline" size="sm" onClick={shareToWhatsApp} className="gap-2 bg-transparent">
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </Button>

        {/* QR Code Dialog */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              QR Code
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Your Referral QR Code</DialogTitle>
              <DialogDescription>Scan this code to sign up with your referral link</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center p-6 bg-white rounded-lg">
              <QRCodeSVG value={referralUrl} size={200} level="H" includeMargin />
            </div>
            <div className="text-center">
              <code className="text-sm bg-muted px-3 py-1 rounded">{referralCode}</code>
            </div>
          </DialogContent>
        </Dialog>

        {/* Native Share */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 bg-transparent">
              <Share2 className="h-4 w-4" />
              More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={shareNative}>Share via device</DropdownMenuItem>
            <DropdownMenuItem onClick={copyToClipboard}>Copy link</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Referral Code */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
        <div>
          <p className="text-sm text-muted-foreground">Your referral code</p>
          <p className="text-2xl font-bold font-mono tracking-wider">{referralCode}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(referralCode)
            toast.success("Code copied!")
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

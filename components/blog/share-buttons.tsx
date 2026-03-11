"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Twitter, Facebook, Linkedin, Copy, Check } from "lucide-react"
import { toast } from "sonner"

interface ShareButtonsProps {
  title: string
  slug: string
}

export function ShareButtons({ title, slug }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)

  // Get the current URL - in production this will be the actual domain
  const getShareUrl = () => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/blog/${slug}`
    }
    return `/blog/${slug}`
  }

  const shareUrl = getShareUrl()
  const encodedUrl = encodeURIComponent(shareUrl)
  const encodedTitle = encodeURIComponent(title)

  const handleTwitterShare = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
    window.open(twitterUrl, "_blank", "width=550,height=420")
  }

  const handleFacebookShare = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    window.open(facebookUrl, "_blank", "width=550,height=420")
  }

  const handleLinkedinShare = () => {
    const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
    window.open(linkedinUrl, "_blank", "width=550,height=420")
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success("Link copied to clipboard!")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy link")
    }
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Share this article:</span>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-[#1DA1F2]/10 hover:text-[#1DA1F2]"
                onClick={handleTwitterShare}
              >
                <Twitter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Share on Twitter</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-[#4267B2]/10 hover:text-[#4267B2]"
                onClick={handleFacebookShare}
              >
                <Facebook className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Share on Facebook</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-[#0A66C2]/10 hover:text-[#0A66C2]"
                onClick={handleLinkedinShare}
              >
                <Linkedin className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Share on LinkedIn</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                onClick={handleCopyLink}
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? "Copied!" : "Copy link"}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}

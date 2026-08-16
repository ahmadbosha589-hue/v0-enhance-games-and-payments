"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ImageIcon, RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ImageChallengeProps {
  onVerify: (success: boolean) => void
}

interface ImageSet {
  category: string
  targetEmoji: string
  images: { id: string; emoji: string; isTarget: boolean }[]
}

const CATEGORIES = [
  { name: "cars", emoji: "🚗", decoys: ["🚌", "🚲", "✈️", "🚀", "🛵", "🚢", "🚁", "🛸"] },
  { name: "fruits", emoji: "🍎", decoys: ["🥕", "🥦", "🌽", "🥔", "🧅", "🌶️", "🥒", "🍖"] },
  { name: "animals", emoji: "🐕", decoys: ["🌳", "🌸", "🏠", "⛰️", "🌊", "☀️", "⭐", "🌙"] },
  { name: "flowers", emoji: "🌸", decoys: ["🔧", "📱", "💻", "🎮", "📺", "🔌", "💡", "🔋"] },
  { name: "stars", emoji: "⭐", decoys: ["🔵", "🟢", "🔴", "🟡", "🟣", "🟤", "⬛", "⬜"] },
  { name: "hearts", emoji: "❤️", decoys: ["💎", "🔶", "🔷", "⬡", "◯", "△", "□", "✧"] },
  { name: "trees", emoji: "🌳", decoys: ["🏢", "🏠", "🏭", "🗼", "🏰", "⛪", "🕌", "🛕"] },
  { name: "suns", emoji: "☀️", decoys: ["🌧️", "⛈️", "🌨️", "🌪️", "🌫️", "💨", "❄️", "🌈"] },
]

function generateImageSet(): ImageSet {
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]

  // Select 2-3 target images
  const targetCount = Math.floor(Math.random() * 2) + 2

  // Select random decoys
  const shuffledDecoys = [...category.decoys].sort(() => Math.random() - 0.5)
  const selectedDecoys = shuffledDecoys.slice(0, 9 - targetCount)

  // Create image array
  const images = [
    ...Array(targetCount)
      .fill(null)
      .map((_, i) => ({
        id: `target-${i}`,
        emoji: category.emoji,
        isTarget: true,
      })),
    ...selectedDecoys.map((emoji, i) => ({
      id: `decoy-${i}`,
      emoji,
      isTarget: false,
    })),
  ].sort(() => Math.random() - 0.5)

  return {
    category: category.name,
    targetEmoji: category.emoji,
    images,
  }
}

export function ImageChallenge({ onVerify }: ImageChallengeProps) {
  const [imageSet, setImageSet] = useState<ImageSet | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<"pending" | "verifying" | "correct" | "incorrect">("pending")
  const [attempts, setAttempts] = useState(0)
  const maxAttempts = 3

  const generateNewChallenge = useCallback(() => {
    setImageSet(generateImageSet())
    setSelectedIds(new Set())
    setStatus("pending")
  }, [])

  useEffect(() => {
    generateNewChallenge()
  }, [generateNewChallenge])

  const toggleSelection = (id: string) => {
    if (status !== "pending") return

    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleVerify = () => {
    if (!imageSet || status !== "pending") return

    setStatus("verifying")

    setTimeout(() => {
      // Check if all and only targets are selected
      const targetIds = new Set(imageSet.images.filter((img) => img.isTarget).map((img) => img.id))

      const allTargetsSelected = [...targetIds].every((id) => selectedIds.has(id))
      const noDecoysSelected = [...selectedIds].every((id) => targetIds.has(id))
      const isCorrect = allTargetsSelected && noDecoysSelected && selectedIds.size > 0

      if (isCorrect) {
        setStatus("correct")
        setTimeout(() => onVerify(true), 1000)
      } else {
        setAttempts((prev) => prev + 1)
        setStatus("incorrect")

        if (attempts + 1 >= maxAttempts) {
          setTimeout(() => onVerify(false), 1500)
        } else {
          setTimeout(() => {
            generateNewChallenge()
          }, 1500)
        }
      }
    }, 500)
  }

  if (!imageSet) return null

  return (
    <Card className="w-full max-w-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          <span className="font-semibold">Image Challenge</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={generateNewChallenge}
          disabled={status !== "pending"}
          className="h-8 w-8"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-1">Select all images showing:</p>
        <p className="text-2xl font-bold flex items-center justify-center gap-2">
          <span className="text-3xl">{imageSet.targetEmoji}</span>
          <span className="capitalize">{imageSet.category}</span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {imageSet.images.map((image) => (
          <button
            key={image.id}
            onClick={() => toggleSelection(image.id)}
            disabled={status !== "pending"}
            className={cn(
              "aspect-square rounded-lg border-2 text-4xl flex items-center justify-center transition-all",
              "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary",
              selectedIds.has(image.id)
                ? "border-primary bg-primary/10 ring-2 ring-primary/50"
                : "border-muted-foreground/20",
              status === "correct" && image.isTarget && "border-green-500 bg-green-500/20",
              status === "incorrect" && selectedIds.has(image.id) && !image.isTarget && "border-red-500 bg-red-500/20",
            )}
          >
            {image.emoji}
          </button>
        ))}
      </div>

      <Button onClick={handleVerify} className="w-full" disabled={selectedIds.size === 0 || status !== "pending"}>
        {status === "verifying" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verifying...
          </>
        ) : (
          "Verify Selection"
        )}
      </Button>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Attempts: {attempts}/{maxAttempts}
        </span>
        <span>{selectedIds.size} selected</span>
      </div>

      {status === "correct" && (
        <div className="flex items-center justify-center gap-2 text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Correct! Proceeding...</span>
        </div>
      )}
      {status === "incorrect" && (
        <div className="flex items-center justify-center gap-2 text-red-600">
          <XCircle className="h-4 w-4" />
          <span className="text-sm font-medium">
            {attempts >= maxAttempts ? "Too many wrong attempts" : "Wrong selection, try again"}
          </span>
        </div>
      )}
    </Card>
  )
}

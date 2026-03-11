"use client"

import { useState, useEffect } from "react"
import { Clock } from "lucide-react"

export function ServerTime() {
  const [time, setTime] = useState<string>("")

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(now.toUTCString().replace("GMT", "UTC"))
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)

    return () => clearInterval(interval)
  }, [])

  if (!time) return null

  return (
    <div className="flex items-center justify-center gap-2 py-3 px-4 text-xs text-muted-foreground border-t border-border bg-muted/30">
      <Clock className="h-3 w-3" />
      <span>Server Time: {time}</span>
    </div>
  )
}

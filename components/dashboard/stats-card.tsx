import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface StatsCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
}

export function StatsCard({
  label,
  value,
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  trend,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn("card-interactive", className)}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <div
            className={cn(
              "flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110",
              iconBg,
            )}
          >
            <Icon className={cn("h-5 w-5 sm:h-6 sm:w-6", iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{label}</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-bold truncate">{value}</p>
            {trend && (
              <p className={cn("text-xs font-medium mt-1", trend.isPositive ? "text-green-500" : "text-red-500")}>
                {trend.isPositive ? "+" : "-"}
                {Math.abs(trend.value)}%
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

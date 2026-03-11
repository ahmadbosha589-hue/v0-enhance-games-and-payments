import { cn } from "@/lib/utils"

interface CryptoFaucetLogoProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  showText?: boolean
}

const sizes = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
}

export function CryptoFaucetLogo({ className, size = "md", showText = false }: CryptoFaucetLogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(sizes[size])}
        aria-hidden="true"
      >
        {/* Outer glow ring */}
        <circle cx="50" cy="50" r="48" className="fill-primary/10" />
        {/* Middle ring */}
        <circle cx="50" cy="50" r="40" className="fill-primary/20" />
        {/* Inner circle */}
        <circle cx="50" cy="50" r="32" className="fill-primary" />
        {/* Bitcoin-inspired droplet/faucet symbol */}
        <path
          d="M50 25C50 25 35 40 35 52C35 60.284 41.716 67 50 67C58.284 67 65 60.284 65 52C65 40 50 25 50 25Z"
          className="fill-primary-foreground"
        />
        {/* Satoshi symbol lines */}
        <path d="M45 48H55M45 52H55M45 56H55" className="stroke-primary" strokeWidth="2" strokeLinecap="round" />
        {/* Top drop accent */}
        <circle cx="50" cy="35" r="3" className="fill-primary-foreground/80" />
      </svg>
      {showText && (
        <span className="font-bold text-foreground">
          Crypto<span className="text-primary">Faucet</span>
        </span>
      )}
    </div>
  )
}

import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg"
}

const sizes = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
}

export function Logo({ className, size = "md" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(sizes[size], className)}
      aria-label="Faucero Logo"
    >
      <circle cx="16" cy="16" r="14" className="fill-primary" />
      <path
        d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6zm0 2a8 8 0 110 16 8 8 0 010-16z"
        className="fill-primary-foreground"
        opacity="0.2"
      />
      <path d="M18.5 10h-5l-1 6h2.5l-1.5 6 5-7h-3l1.5-5z" className="fill-primary-foreground" />
    </svg>
  )
}

export const LogoIcon = Logo

export function LogoText({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold tracking-tight", className)}>
      <span className="text-gradient-primary">Fau</span>
      <span>cero</span>
    </span>
  )
}

export function LogoFull({ className, size = "md" }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Logo size={size} />
      <LogoText
        className={cn({
          "text-lg": size === "sm",
          "text-xl": size === "md",
          "text-2xl": size === "lg",
        })}
      />
    </div>
  )
}

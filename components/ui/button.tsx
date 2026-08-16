import type * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-tight transition-all duration-300 ease-out cursor-pointer select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-300 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.96] active:duration-100",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1),inset_0_1px_0_0_rgba(255,255,255,0.1)] hover:shadow-[0_10px_40px_-10px_var(--primary),0_4px_20px_-8px_rgba(0,0,0,0.3)] hover:from-primary/95 hover:to-primary/85 hover:-translate-y-0.5 hover:scale-[1.02] [&_svg]:group-hover/btn:translate-x-0.5 before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-b before:from-white/[0.12] before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300",
        destructive:
          "bg-gradient-to-b from-destructive to-destructive/90 text-white shadow-[0_1px_3px_0_rgba(0,0,0,0.1),inset_0_1px_0_0_rgba(255,255,255,0.1)] hover:shadow-[0_10px_40px_-10px_var(--destructive),0_4px_20px_-8px_rgba(0,0,0,0.3)] hover:from-destructive/95 hover:to-destructive/85 hover:-translate-y-0.5 hover:scale-[1.02] focus-visible:ring-destructive/30 dark:focus-visible:ring-destructive/50 dark:from-destructive/80 dark:to-destructive/70",
        outline:
          "border-2 border-border/60 bg-background/80 backdrop-blur-sm shadow-sm hover:bg-accent/40 hover:text-accent-foreground hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-10px_rgba(0,0,0,0.15)] dark:bg-card/30 dark:border-border/50 dark:hover:bg-card/60 dark:hover:border-primary/40 dark:hover:text-foreground",
        secondary:
          "bg-gradient-to-b from-secondary to-secondary/90 text-secondary-foreground shadow-sm hover:from-secondary/95 hover:to-secondary/80 hover:-translate-y-0.5 hover:shadow-md",
        ghost:
          "hover:bg-accent/50 hover:text-accent-foreground hover:scale-[1.02] dark:hover:bg-accent/30",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80",
        glow:
          "bg-gradient-to-r from-primary via-primary/90 to-primary text-primary-foreground shadow-[0_0_20px_-5px_var(--primary)] hover:shadow-[0_0_40px_-5px_var(--primary),0_0_80px_-10px_var(--primary)] hover:-translate-y-1 hover:scale-[1.03] before:absolute before:inset-0 before:rounded-xl before:bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.15)_50%,transparent_75%)] before:bg-[length:250%_250%] before:animate-[shimmer_3s_linear_infinite] overflow-hidden",
      },
      size: {
        default: "h-10 px-5 py-2.5 has-[>svg]:px-4",
        sm: "h-8 rounded-lg gap-1.5 px-3.5 text-xs has-[>svg]:px-2.5",
        lg: "h-11 rounded-xl px-7 text-base has-[>svg]:px-5",
        xl: "h-12 rounded-xl px-8 text-base font-semibold has-[>svg]:px-6",
        "2xl": "h-14 rounded-2xl px-10 text-lg font-semibold has-[>svg]:px-8",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-11 rounded-xl",
        "icon-xl": "size-12 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }

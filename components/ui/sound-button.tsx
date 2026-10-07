"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { useButtonSounds, type SoundType } from "@/hooks/use-button-sounds"

type ButtonProps = React.ComponentProps<typeof Button>

interface SoundButtonProps extends ButtonProps {
  clickSound?: SoundType | false
  hoverSound?: SoundType | false
}

/**
 * A Button component with integrated sound effects.
 * 
 * Usage:
 * <SoundButton>Click Me</SoundButton> // Default click sound
 * <SoundButton clickSound="success">Submit</SoundButton> // Custom sound
 * <SoundButton clickSound={false}>Silent</SoundButton> // No sound
 */
const SoundButton = React.forwardRef<HTMLButtonElement, SoundButtonProps>(
  ({ clickSound = "click", hoverSound = false, onClick, onMouseEnter, ...props }, ref) => {
    const { playSound } = useButtonSounds()

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (clickSound !== false) {
          playSound(clickSound)
        }
        onClick?.(e)
      },
      [clickSound, onClick, playSound]
    )

    const handleMouseEnter = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (hoverSound !== false && hoverSound) {
          playSound(hoverSound)
        }
        onMouseEnter?.(e)
      },
      [hoverSound, onMouseEnter, playSound]
    )

    return (
      <Button
        ref={ref}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        {...props}
      />
    )
  }
)
SoundButton.displayName = "SoundButton"

export { SoundButton, type SoundButtonProps }

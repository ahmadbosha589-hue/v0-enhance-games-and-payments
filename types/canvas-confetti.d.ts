declare module "canvas-confetti" {
  interface ConfettiOptions {
    particleCount?: number
    spread?: number
    origin?: { x?: number; y?: number }
    scalar?: number
    colors?: string[]
    ticks?: number
    gravity?: number
    decay?: number
    startVelocity?: number
  }

  const confetti: (options?: ConfettiOptions) => Promise<null>
  export default confetti
}

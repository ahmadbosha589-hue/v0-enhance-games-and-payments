import { describe, expect, it, vi } from "vitest"
import { scheduleIdleTask, type IdleSchedulerRuntime } from "@/lib/perf/idle-scheduler"

describe("Phase 03 scheduling budgets", () => {
  it("uses requestIdleCallback with a bounded timeout when available", () => {
    const requestIdleCallback = vi.fn((callback: () => void, options?: { timeout?: number }) => {
      callback()
      return 17
    })
    const cancelIdleCallback = vi.fn()
    const runtime: IdleSchedulerRuntime = {
      requestIdleCallback,
      cancelIdleCallback,
      setTimeout,
      clearTimeout,
    }
    const work = vi.fn()

    const cancel = scheduleIdleTask(work, { timeout: 1500 }, runtime)

    expect(work).toHaveBeenCalledOnce()
    expect(requestIdleCallback).toHaveBeenCalledWith(work, { timeout: 1500 })
    cancel()
    expect(cancelIdleCallback).toHaveBeenCalledWith(17)
  })

  it("falls back to a cancellable zero-delay timer", () => {
    const setTimeout = vi.fn((callback: () => void) => {
      callback()
      return 23
    }) as unknown as IdleSchedulerRuntime["setTimeout"]
    const clearTimeout = vi.fn()
    const runtime: IdleSchedulerRuntime = { setTimeout, clearTimeout }
    const work = vi.fn()

    const cancel = scheduleIdleTask(work, { timeout: 1500 }, runtime)

    expect(work).toHaveBeenCalledOnce()
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 0)
    cancel()
    expect(clearTimeout).toHaveBeenCalledWith(23)
  })

  it("keeps first-party Next image optimization enabled", async () => {
    const { default: nextConfig } = await import("../../next.config.mjs")
    const images = (nextConfig as { images?: { unoptimized?: boolean } }).images

    expect(images?.unoptimized).not.toBe(true)
  })
})

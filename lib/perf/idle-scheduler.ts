export type IdleSchedulerTimer = ReturnType<typeof setTimeout>

export interface IdleSchedulerRuntime {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
  setTimeout: (callback: () => void, delay: number) => IdleSchedulerTimer
  clearTimeout: (handle: IdleSchedulerTimer) => void
}

export interface IdleTaskOptions {
  /** Maximum time to wait before running work even when the main thread is busy. */
  timeout?: number
}

/**
 * Schedule non-critical browser work in an idle period, with a timer fallback.
 *
 * Keeping the browser API behind this small adapter lets security/performance
 * callers share the same cancellation semantics and keeps the policy easy to
 * exercise without a real browser or credentials.
 */
export function scheduleIdleTask(
  callback: () => void,
  { timeout = 1500 }: IdleTaskOptions = {},
  runtime?: IdleSchedulerRuntime,
): () => void {
  const scheduler =
    runtime ??
    (typeof window !== "undefined" ? (window as unknown as IdleSchedulerRuntime) : undefined)

  if (!scheduler) return () => {}

  if (typeof scheduler.requestIdleCallback === "function") {
    const handle = scheduler.requestIdleCallback(callback, { timeout })
    return () => scheduler.cancelIdleCallback?.(handle)
  }

  const handle = scheduler.setTimeout(callback, 0)
  return () => scheduler.clearTimeout(handle)
}

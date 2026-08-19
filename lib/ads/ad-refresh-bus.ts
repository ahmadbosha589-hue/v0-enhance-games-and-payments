export interface AdRefreshEvent {
  networkId: string
  tick: number
}

type Listener = (event: AdRefreshEvent) => void

interface Subscription {
  networkId: string
  intervalMs: number
  nextAt: number
  listener: Listener
}

const subscriptions = new Set<Subscription>()
let timer: ReturnType<typeof setInterval> | null = null
let sequence = 0
let visibilityBound = false

function emitDueEvents() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return

  const now = Date.now()
  for (const subscription of subscriptions) {
    if (now < subscription.nextAt) continue
    subscription.nextAt = now + subscription.intervalMs
    subscription.listener({ networkId: subscription.networkId, tick: ++sequence })
  }
}

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startTimer() {
  if (timer || subscriptions.size === 0) return
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return
  // One process-wide scheduler; subscriptions carry their own cadence.
  timer = setInterval(emitDueEvents, 1000)
}

function handleVisibilityChange() {
  if (typeof document === "undefined") return
  if (document.visibilityState === "visible") {
    const now = Date.now()
    for (const subscription of subscriptions) subscription.nextAt = now + subscription.intervalMs
    startTimer()
  } else {
    stopTimer()
  }
}

function bindVisibilityListener() {
  if (visibilityBound || typeof document === "undefined") return
  visibilityBound = true
  document.addEventListener("visibilitychange", handleVisibilityChange)
}

function unbindVisibilityListener() {
  if (!visibilityBound || typeof document === "undefined") return
  visibilityBound = false
  document.removeEventListener("visibilitychange", handleVisibilityChange)
}

export function subscribeAdRefresh(
  networkId: string,
  listener: Listener,
  intervalMs: number,
): () => void {
  const subscription: Subscription = {
    networkId,
    listener,
    intervalMs: Math.max(1000, intervalMs),
    nextAt: Date.now() + Math.max(1000, intervalMs),
  }
  subscriptions.add(subscription)
  bindVisibilityListener()
  startTimer()

  return () => {
    subscriptions.delete(subscription)
    if (subscriptions.size === 0) {
      stopTimer()
      unbindVisibilityListener()
    }
  }
}

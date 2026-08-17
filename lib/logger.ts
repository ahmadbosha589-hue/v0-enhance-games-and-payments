type LogLevel = "debug" | "info" | "warn" | "error"

interface LogContext {
  userId?: string
  action?: string
  resourceType?: string
  resourceId?: string
  ip?: string
  duration?: number
  [key: string]: unknown
}

class Logger {
  private isDev = process.env.NODE_ENV === "development"
  private isProd = process.env.NODE_ENV === "production"

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const contextStr = context ? ` ${JSON.stringify(context)}` : ""
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`
  }

  private logInternal(level: LogLevel, message: string, context?: LogContext) {
    if (this.isProd && (level === "debug" || level === "info")) {
      return
    }

    const formatted = this.formatMessage(level, message, context)

    switch (level) {
      case "debug":
        if (this.isDev) console.debug(formatted)
        break
      case "info":
        if (this.isDev) console.info(formatted)
        break
      case "warn":
        console.warn(formatted)
        break
      case "error":
        console.error(formatted)
        break
    }
  }

  debug(message: string, context?: LogContext) {
    this.logInternal("debug", message, context)
  }

  info(message: string, context?: LogContext) {
    this.logInternal("info", message, context)
  }

  warn(message: string, context?: LogContext) {
    this.logInternal("warn", message, context)
  }

  error(message: string, error?: Error, context?: LogContext) {
    this.logInternal("error", message, {
      ...context,
      errorMessage: error?.message,
      ...(this.isDev && { errorStack: error?.stack }),
    })
  }

  // Specialized logging methods
  apiRequest(method: string, path: string, duration: number, statusCode: number, context?: LogContext) {
    this.info(`${method} ${path} ${statusCode}`, {
      ...context,
      duration,
      statusCode,
    })
  }

  claim(userId: string, amount: number, success: boolean, context?: LogContext) {
    this.info(`Claim ${success ? "succeeded" : "failed"}`, {
      ...context,
      userId,
      amount,
      success,
    })
  }

  withdrawal(userId: string, amount: number, status: string, context?: LogContext) {
    this.info(`Withdrawal ${status}`, {
      ...context,
      userId,
      amount,
      status,
    })
  }

  fraud(userId: string, score: number, flags: string[], context?: LogContext) {
    this.warn(`Fraud detected`, {
      ...context,
      userId,
      score,
      flags,
    })
  }

  adminAction(adminId: string, action: string, targetId: string, context?: LogContext) {
    this.info(`Admin action: ${action}`, {
      ...context,
      adminId,
      action,
      targetId,
    })
  }
}

export const logger = new Logger()

export const log = logger

/**
 * Coerce an unknown caught value into an Error for `log.error()`.
 *
 * `catch (e)` gives `unknown`, and log.error's second parameter is positional
 * (`error?: Error`) — not a context object. Many call sites were written as
 * `log.error("msg", { error })`, which type-fails and drops the value into the
 * Error slot where only `.message`/`.stack` are read, so the detail was lost.
 * This makes the correct call shape a one-liner: `log.error("msg", toError(e))`.
 */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value
  if (typeof value === "string") return new Error(value)
  try {
    return new Error(JSON.stringify(value))
  } catch {
    return new Error(String(value))
  }
}

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * Admin-client accessors that cannot silently produce a null dereference.
 *
 * WHY THIS EXISTS
 * ---------------
 * `createAdminClient()` returns `null` when Supabase is not configured — and
 * since the S20 fix, also when `SUPABASE_SERVICE_ROLE_KEY` is missing (it used
 * to silently downgrade to the anon key, which turned a config error into an
 * authorization bug).
 *
 * 31 of the 62 API routes that call it never checked the result, then
 * immediately did `.from(...)`. Those are `TypeError: Cannot read properties of
 * null` at runtime — a 500 with a stack trace instead of a clean 503, on money
 * paths like /api/claim, /api/ccpayment/*, /api/advertise and
 * /api/cron/process-withdrawals.
 *
 * `requireAdminClient()` narrows the type, so TypeScript enforces the check at
 * every new call site instead of relying on reviewer discipline.
 */

export class ServiceUnavailableError extends Error {
  readonly status = 503
  constructor(message = "Database not configured") {
    super(message)
    this.name = "ServiceUnavailableError"
  }
}

export type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

/**
 * Returns a non-null admin (service-role) client or throws
 * ServiceUnavailableError. Use inside a handler wrapped by `withAdminClient`,
 * or catch it yourself.
 */
export function requireAdminClient(): AdminClient {
  const client = createAdminClient()
  if (!client) {
    throw new ServiceUnavailableError(
      "Supabase admin client unavailable (check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)",
    )
  }
  return client
}

/**
 * Wraps a route handler so a missing admin client becomes a clean 503 JSON
 * response rather than an unhandled TypeError.
 *
 * Only ServiceUnavailableError is translated; every other error is rethrown so
 * existing per-route error handling and logging keep working unchanged.
 */
export function withAdminClient<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args)
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        console.error("[AdminClient]", err.message)
        return NextResponse.json(
          { error: "Service temporarily unavailable" },
          { status: 503, headers: { "Retry-After": "30" } },
        )
      }
      throw err
    }
  }
}

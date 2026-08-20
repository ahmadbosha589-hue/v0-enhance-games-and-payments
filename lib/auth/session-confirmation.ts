export interface SessionConfirmationOptions {
  attempts?: number
  delayMs?: number
  timeoutMs?: number
}

type SessionFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Wait until the server can read the newly written httpOnly Supabase session
 * cookie. Client-side sign-in can resolve before the cookie is visible to the
 * next server request, which otherwise creates a dashboard -> login bounce.
 */
export async function waitForServerSession(
  fetchImpl: SessionFetch = fetch,
  options: SessionConfirmationOptions = {},
): Promise<boolean> {
  const attempts = Math.max(1, options.attempts ?? 6)
  const delayMs = Math.max(0, options.delayMs ?? 350)
  const timeoutMs = Math.max(250, options.timeoutMs ?? 1500)

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout
          ? AbortSignal.timeout(timeoutMs)
          : undefined,
      })

      if (response.ok) {
        const data = await response.json().catch(() => null)
        if (data?.user) return true
      }
    } catch {
      // Retry while the browser/server cookie exchange settles.
    }

    if (attempt < attempts - 1) await sleep(delayMs)
  }

  return false
}

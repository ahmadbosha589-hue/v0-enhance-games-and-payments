"use client"

import { createClient } from "@/lib/supabase/client"

export interface SignOutActions {
  serverLogout: () => Promise<void>
  clientLogout: () => Promise<void>
  clearLocalState: () => void
  redirect: () => void
}

/**
 * Run logout in an order that cannot strand the httpOnly server session:
 * revoke the server cookie first, then revoke the browser session, then clear
 * local state and navigate to a cache-busted public page.
 */
export async function executeSignOut(actions: SignOutActions): Promise<void> {
  try {
    await actions.serverLogout()
  } catch (error) {
    console.warn("[SignOut] Server logout failed:", error)
  }

  try {
    await actions.clientLogout()
  } catch (error) {
    console.warn("[SignOut] Client logout failed:", error)
  }

  actions.clearLocalState()
  actions.redirect()
}

function clearLocalAuthState(): void {
  if (typeof window === "undefined") return

  try {
    const clearMatching = (storage: Storage) => {
      Object.keys(storage)
        .filter((key) => key.includes("supabase") || key.includes("sb-") || key.includes("auth"))
        .forEach((key) => storage.removeItem(key))
    }

    clearMatching(window.localStorage)
    clearMatching(window.sessionStorage)

    document.cookie.split(";").forEach((rawCookie) => {
      const name = rawCookie.split("=")[0].trim()
      if (name.includes("supabase") || name.includes("sb-")) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      }
    })
  } catch (error) {
    console.warn("[SignOut] Local cleanup failed:", error)
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("Client logout timeout")), milliseconds)
    }),
  ])
}

export async function signOutEverywhere(): Promise<void> {
  if (typeof window === "undefined") return

  await executeSignOut({
    serverLogout: async () => {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-store" },
      })
      if (!response.ok) throw new Error(`Server logout returned ${response.status}`)
    },
    clientLogout: async () => {
      const supabase = createClient()
      await withTimeout(supabase.auth.signOut({ scope: "global" }), 4000)
    },
    clearLocalState: clearLocalAuthState,
    redirect: () => {
      window.location.replace(`/?signedOut=${Date.now()}`)
    },
  })
}

import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const createServerClientMock = vi.hoisted(() => vi.fn())
vi.mock("@supabase/ssr", () => ({ createServerClient: createServerClientMock }))

import { updateSession } from "@/lib/supabase/proxy"

describe("Supabase refresh-cookie propagation", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  it("does not return before a slow token refresh writes the rotated cookie", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key"

    createServerClientMock.mockImplementation((_url: string, _key: string, options: any) => ({
      auth: {
        getUser: async () => {
          await new Promise((resolve) => setTimeout(resolve, 2100))
          options.cookies.setAll([
            {
              name: "sb-project-auth-token",
              value: "fresh-session-cookie",
              options: { path: "/", httpOnly: true },
            },
          ])
          return { data: { user: { id: "user-1" } }, error: null }
        },
      },
    }))

    const request = new NextRequest("https://app.test/dashboard", {
      headers: { cookie: "sb-project-auth-token=stale-session-cookie" },
    })

    const response = await updateSession(request)

    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("fresh-session-cookie")
  })
})

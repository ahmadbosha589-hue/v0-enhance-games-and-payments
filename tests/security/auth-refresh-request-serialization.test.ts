import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const createServerClientMock = vi.hoisted(() => vi.fn())
vi.mock("@supabase/ssr", () => ({ createServerClient: createServerClientMock }))

import { updateSession } from "@/lib/supabase/proxy"

describe("Supabase refresh request serialization", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  it("does not refresh the session on RSC requests", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key"
    const request = new NextRequest("https://app.test/dashboard", {
      headers: {
        cookie: "sb-project-auth-token=session-cookie",
        rsc: "1",
      },
    })

    await updateSession(request)

    expect(createServerClientMock).not.toHaveBeenCalled()
  })

  it("does not refresh the session on Next.js prefetch requests", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key"
    const request = new NextRequest("https://app.test/dashboard", {
      headers: {
        cookie: "sb-project-auth-token=session-cookie",
        "next-router-prefetch": "1",
      },
    })

    await updateSession(request)

    expect(createServerClientMock).not.toHaveBeenCalled()
  })
})

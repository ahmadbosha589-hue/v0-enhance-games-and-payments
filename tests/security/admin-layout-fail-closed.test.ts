import { beforeEach, describe, expect, it, vi } from "vitest"

const layoutDeps = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  redirect: vi.fn(),
  noStore: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  requireAdmin: layoutDeps.requireAdmin,
}))
vi.mock("next/navigation", () => ({
  redirect: layoutDeps.redirect,
}))
vi.mock("next/cache", () => ({
  unstable_noStore: layoutDeps.noStore,
}))
vi.mock("@/components/admin/sidebar", () => ({
  AdminSidebar: () => null,
}))
vi.mock("@/components/admin/header", () => ({
  AdminHeader: () => null,
}))
vi.mock("@/components/server-time", () => ({
  ServerTime: () => null,
}))
vi.mock("@/components/admin/supabase-health-provider", () => ({
  SupabaseHealthProvider: () => null,
}))
vi.mock("@/components/admin/connectivity-banner", () => ({
  ConnectivityBanner: () => null,
}))

import AdminLayout from "@/app/admin/layout"

describe("Phase 02b admin layout guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    layoutDeps.requireAdmin.mockResolvedValue(null)
    layoutDeps.redirect.mockImplementation((location: string) => {
      throw new Error(`NEXT_REDIRECT:${location}`)
    })
  })

  it("redirects instead of rendering the admin shell without a verified admin", async () => {
    await expect(AdminLayout({ children: null })).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login?redirect=/admin",
    )

    expect(layoutDeps.noStore).toHaveBeenCalledOnce()
    expect(layoutDeps.requireAdmin).toHaveBeenCalledWith([
      "admin",
      "superadmin",
      "moderator",
      "owner",
    ])
    expect(layoutDeps.redirect).toHaveBeenCalledWith("/auth/login?redirect=/admin")
  })
})

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("dashboard authenticated header", () => {
  it("passes the server-authenticated user to the dashboard menu", () => {
    const header = source("components/dashboard/header.tsx")
    const layout = source("app/dashboard/layout.tsx")

    expect(header).toContain('from "@/components/user-menu"')
    expect(header).toContain("user: {")
    expect(header).toContain("<UserMenu")
    expect(header).toContain("id: user.id")
    expect(layout).toContain("<DashboardHeader profile={safeProfile} user={user} />")
  })
})

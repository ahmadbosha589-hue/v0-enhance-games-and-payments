import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("auth redirect race protection", () => {
  it("requires server session confirmation before login/signup dashboard redirects", () => {
    const login = read("app/auth/login/page.tsx")
    const signup = read("app/auth/sign-up/page.tsx")

    expect(login).toContain("waitForServerSession")
    expect(signup).toContain("waitForServerSession")
    expect(login).not.toContain("warm=1")
    expect(login).not.toContain("serverSeesSession ? safeRedirect")
  })
})

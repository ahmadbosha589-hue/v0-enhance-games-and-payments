import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("server auth refresh serialization", () => {
  it("does not run getSession concurrently with getUser", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/supabase/server.ts"), "utf8")
    expect(source).not.toContain("const sessionPromise")
    expect(source).not.toContain("const sessionTimeout")
  })
})

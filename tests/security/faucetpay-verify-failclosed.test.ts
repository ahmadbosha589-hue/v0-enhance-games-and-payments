import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("faucetpay email verification fails closed", () => {
  const routeSource = () => read("app/api/faucetpay/verify/route.ts")
  const clientSource = () => read("lib/faucetpay/client.ts")

  it("verify route contains no simulated development-mode success", () => {
    const source = routeSource()
    expect(source).not.toContain("development mode")
    expect(source).not.toContain("Auto-verify in dev mode")
    expect(source).not.toContain("FAUCETPAY_API_KEY not set")
  })

  it("verify route returns 503 and never writes verified=true when unconfigured", () => {
    const source = routeSource()

    // Unconfigured requests are refused before any profile write.
    expect(source).toContain("FaucetPay verification is not configured")
    expect(source).toContain("status: 503")
    expect(source).toContain("if (!(await isFaucetPayConfiguredAsync()))")

    // Exactly one faucetpay_verified: true write may exist, and it must sit
    // behind a real FaucetPay API result: after verifyFaucetPayEmail runs and
    // inside the verification.valid branch.
    const trueWrites = source.split("faucetpay_verified: true").length - 1
    expect(trueWrites).toBe(1)

    const firstTrueWrite = source.indexOf("faucetpay_verified: true")
    const verifyCall = source.indexOf("await verifyFaucetPayEmail(")
    expect(verifyCall).toBeGreaterThan(-1)
    expect(firstTrueWrite).toBeGreaterThan(verifyCall)

    const validGuard = source.indexOf("if (verification.valid)")
    expect(validGuard).toBeGreaterThan(-1)
    expect(firstTrueWrite).toBeGreaterThan(validGuard)
  })

  it("client reports valid:false (not_configured) when FaucetPay is unconfigured", () => {
    const source = clientSource()
    const configuredCheck = source.indexOf("isFaucetPayConfiguredAsync())")
    expect(configuredCheck).toBeGreaterThan(-1)
    const apiCall = source.indexOf("checkAddress", configuredCheck)
    expect(apiCall).toBeGreaterThan(configuredCheck)

    // Between the configured-check and the real API call only the fail-closed
    // not_configured result may appear - never a simulated success.
    const unconfiguredBranch = source.slice(configuredCheck, apiCall)
    expect(unconfiguredBranch).toContain('return { valid: false, error: "not_configured" }')
    expect(unconfiguredBranch).not.toContain("valid: true")
    expect(source).not.toContain("assume valid (for development)")
  })
})

import { spawn } from "node:child_process"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()

async function runSmoke(healthStatus: number) {
  const server = createServer((request, response) => {
    response.statusCode = request.url === "/api/health" ? healthStatus : 200
    response.end("ok")
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const { port } = server.address() as AddressInfo
  const child = spawn(process.execPath, ["scripts/smoke.mjs"], {
    cwd: ROOT,
    env: { ...process.env, SMOKE_BASE_URL: `http://127.0.0.1:${port}` },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk })
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { output += chunk })
  try {
    const code = await new Promise<number>((resolve, reject) => {
      child.once("error", reject)
      child.once("close", (value) => resolve(value ?? 1))
    })
    return { code, output }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe("anonymous smoke test", () => {
  it("passes when public routes are reachable", async () => {
    const result = await runSmoke(200)
    expect(result.code).toBe(0)
    expect(result.output).toContain("ALL PASS")
  }, 20_000)

  it("fails when the health endpoint is unavailable", async () => {
    const result = await runSmoke(503)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain("FAIL 503 /api/health")
  }, 20_000)
})

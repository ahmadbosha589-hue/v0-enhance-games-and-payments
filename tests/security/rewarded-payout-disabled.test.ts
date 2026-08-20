import { describe, expect, it } from "vitest"
import { POST as bonusPost } from "@/app/api/bonus-reward/claim/route"
import { POST as supportPost } from "@/app/api/support-us/claim/route"
import { POST as supportDoublePost } from "@/app/api/support-us/double/route"

describe("unverified rewarded-ad payout surfaces", () => {
  it("does not issue a bonus reward without verified inventory", async () => {
    const response = await bonusPost(new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ type: "faucet", baseAmount: 1, multiplier: 10 }),
      headers: { "Content-Type": "application/json" },
    }) as never)
    expect(response.status).toBe(503)
  })

  it("does not issue support-ad payouts without server-side sessions", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ adsWatched: 3 }),
      headers: { "Content-Type": "application/json" },
    })
    expect((await supportPost(request as never)).status).toBe(503)
    expect((await supportDoublePost(request as never)).status).toBe(503)
  })
})

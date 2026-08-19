import { describe, expect, it } from "vitest"
import { channelForPlacement } from "@/lib/ads/first-party"

describe("first-party ad placement channels", () => {
  it("maps supported page placements to the campaign channels", () => {
    expect(channelForPlacement("header")).toBe("banner-network")
    expect(channelForPlacement("footer")).toBe("banner-network")
    expect(channelForPlacement("sidebar")).toBe("banner-network")
    expect(channelForPlacement("content")).toBe("native-ads")
  })
})

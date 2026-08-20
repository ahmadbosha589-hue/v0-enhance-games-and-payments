import { describe, expect, it } from "vitest"
import {
  decimalToBaseUnits,
  encodeErc20Transfer,
  isVerifiedErc20Transfer,
} from "@/lib/wallet/evm-payment"

describe("EVM wallet payment primitives", () => {
  it("converts decimal token amounts without floating-point loss", () => {
    expect(decimalToBaseUnits("5", 6)).toBe("5000000")
    expect(decimalToBaseUnits("1.25", 6)).toBe("1250000")
  })

  it("encodes an ERC-20 transfer transaction", () => {
    const data = encodeErc20Transfer(
      "0x1111111111111111111111111111111111111111",
      "5000000",
    )
    expect(data).toBe(
      "0xa9059cbb" +
        "0000000000000000000000001111111111111111111111111111111111111111" +
        "00000000000000000000000000000000000000000000000000000000004c4b40",
    )
  })

  it("accepts only a successful transfer to the configured token and destination", () => {
    const receipt = {
      status: "0x1",
      logs: [{
        address: "0x2222222222222222222222222222222222222222",
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
          "0x0000000000000000000000003333333333333333333333333333333333333333",
          "0x0000000000000000000000001111111111111111111111111111111111111111",
        ],
        data: "0x00000000000000000000000000000000000000000000000000000000004c4b40",
      }],
    }

    expect(isVerifiedErc20Transfer(receipt, {
      tokenAddress: "0x2222222222222222222222222222222222222222",
      destinationAddress: "0x1111111111111111111111111111111111111111",
      minimumBaseUnits: "5000000",
    })).toBe(true)
  })
})

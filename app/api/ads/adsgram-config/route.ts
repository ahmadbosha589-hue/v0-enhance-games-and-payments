import { NextResponse } from "next/server"

/**
 * Public AdsGram configuration for the rewarded-ad flow.
 * Returns ONLY the block id — safe for the client. The block id is a public
 * placement identifier (like an AdSense slot id), not a secret.
 */
export async function GET() {
  return NextResponse.json({
    blockId: process.env.NEXT_PUBLIC_ADSGRAM_BLOCK_ID || "",
    enabled: !!process.env.NEXT_PUBLIC_ADSGRAM_BLOCK_ID,
  })
}
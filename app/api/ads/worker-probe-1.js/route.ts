// Worker probe endpoint 1
import { NextResponse } from "next/server"

export async function GET() {
  return new NextResponse("/* worker probe 1 */", {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store",
    },
  })
}

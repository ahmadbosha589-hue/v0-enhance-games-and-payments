// Worker probe endpoint 2
import { NextResponse } from "next/server"

export async function GET() {
  return new NextResponse("/* worker probe 2 */", {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store",
    },
  })
}

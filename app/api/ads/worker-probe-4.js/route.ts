// Worker probe endpoint 4
import { NextResponse } from "next/server"

export async function GET() {
  return new NextResponse("/* worker probe 4 */", {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store",
    },
  })
}

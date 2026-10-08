import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it, expect } from "vitest"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

// The advertise D1 property: the network list is declared EXACTLY ONCE in
// lib/config/ad-networks.ts and imported by both the advertise UI and API.
// These tests fail if anyone reintroduces a local literal or a network id
// that no longer exists on the shared config.

const UI = read("app/dashboard/advertise/page.tsx")
const API = read("app/api/advertise/route.ts")
const CONFIG = read("lib/config/ad-networks.ts")

const NETWORK_IDS = [
  "adsterra",
  "propellerads",
  "hilltopads",
  "coinzilla",
  "bitmedia",
  "a-ads",
  "cointraffic",
  "trafficstars",
  "mellowads",
]

describe("advertise networks have one source of truth", () => {
  it("UI imports the shared config and declares no local AD_NETWORKS literal", () => {
    expect(UI).toMatch(/from "@\/lib\/config\/ad-networks"/)
    expect(UI).not.toMatch(/const AD_NETWORKS = \{/)
  })

  it("API imports the shared config and declares no local AD_NETWORKS literal", () => {
    expect(API).toMatch(/from "@\/lib\/config\/ad-networks"/)
    expect(API).not.toMatch(/const AD_NETWORKS = \{/)
  })

  it("shared config declares all 9 networks", () => {
    for (const id of NETWORK_IDS) {
      expect(CONFIG, `missing network: ${id}`).toMatch(new RegExp(`"${id}":\\s*\\{`))
    }
  })

  it("every network in the shared config has minBudget, cpm, name, description", () => {
    for (const id of NETWORK_IDS) {
      const start = CONFIG.indexOf(`"${id}":`)
      const rest = CONFIG.slice(start + 1)
      const nextId = rest.search(/\n  "[a-z-]+": \{/)
      const body = nextId === -1 ? rest : rest.slice(0, nextId)
      expect(body, `${id}: missing minBudget`).toMatch(/minBudget:\s*\d/)
      expect(body, `${id}: missing cpm`).toMatch(/cpm:\s*[\d.]+/)
      expect(body, `${id}: missing name`).toMatch(/name:\s*"/)
      expect(body, `${id}: missing description`).toMatch(/description:\s*"/)
    }
  })
})

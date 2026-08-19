import { describe, expect, it } from "vitest"
import { AD_NETWORKS } from "@/lib/ads/registry"
import AdvertisingPartnersPage from "@/app/(public)/advertising-partners/page"
import PrivacyPage from "@/app/(public)/privacy/page"
import CookiePolicyPage from "@/app/(public)/cookies/page"

type ReactLikeNode = {
  props?: {
    children?: ReactLikeNode | ReactLikeNode[]
    href?: string
  }
}

function textContent(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textContent).join(" ")
  if (typeof node === "object" && node !== null && "props" in node) {
    return textContent((node as ReactLikeNode).props?.children)
  }
  return ""
}

function hrefs(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return []
  if (Array.isArray(node)) return node.flatMap(hrefs)
  if (typeof node !== "object") return []

  const element = node as ReactLikeNode
  const ownHref = element.props?.href
  const children = element.props?.children
  return [
    ...(ownHref ? [ownHref] : []),
    ...hrefs(children),
  ]
}

describe("public advertising disclosure", () => {
  it("renders every registry network and states the current disabled posture", () => {
    const text = textContent(AdvertisingPartnersPage())

    expect(text).toContain("Every network currently marked as unverified is disabled.")
    expect(text).toContain("No AdSense publisher integration is active.")

    for (const network of AD_NETWORKS) {
      expect(text).toContain(network.name)
    }
  })

  it("links the privacy and cookie pages to the disclosure", () => {
    expect(hrefs(PrivacyPage())).toContain("/advertising-partners")
    expect(hrefs(CookiePolicyPage())).toContain("/advertising-partners")
  })
})

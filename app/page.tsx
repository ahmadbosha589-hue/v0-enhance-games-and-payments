import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getUser } from "@/lib/supabase/server"
import HomePageClient from "@/components/landing/home-page-client"
import { AAdsAdaptiveUnit } from "@/components/ads/aads-adaptive-unit"
import { AAdsStickyUnit } from "@/components/ads/aads-sticky-unit"
import { AdsterraUnits } from "@/components/ads/adsterra-units"

// Force this route to render dynamically — it needs request-scoped cookies
// to make the auth-aware redirect decision below.
export const dynamic = "force-dynamic"

/**
 * Landing-page entry point.
 *
 * Logged-in users were previously redirected client-side: the entire
 * landing page was hydrated, useEffect kicked in, supabase.auth.getSession()
 * ran, then `window.location.replace("/dashboard")` triggered a full page
 * reload. That was both wasteful (downloading + hydrating UI we throw
 * away) and racy (it could fire mid-navigation and contribute to redirect
 * loops with the dashboard layout).
 *
 * We now resolve the session SERVER-SIDE on the `/` route and issue a
 * single 307 redirect to `/dashboard` before sending any HTML. Visitors
 * without a session skip the auth round-trip entirely (we check for the
 * session cookie first; only run getUser() if the cookie is actually
 * present) so the marketing page stays fast for cold traffic.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ signedOut?: string }>
}) {
  const params = await searchParams

  // Just-signed-out users carry `?signedOut=…`. Even if the browser still
  // holds a transient cookie for a tick, we want to show them the landing
  // page (the client component will clean the URL on mount).
  if (params?.signedOut) {
    return (
      <>
        <HomePageClient />
        {/* A-ADS adaptive banner unit 2457981 — the landing page renders
            outside the (public) route group, so mount it explicitly. */}
        <AAdsAdaptiveUnit />
        {/* A-ADS dismissable sticky/anchor unit at the top of the viewport. */}
        <AAdsStickyUnit />
        {/* Adsterra real placements — intrusive units suppressed on the
            first-touch landing page (no popunder/social bar here). */}
        <AdsterraUnits disableIntrusive />
      </>
    )
  }

  // Cheap cookie sniff first — most visitors are anonymous and won't even
  // have an `sb-…-auth-token` cookie. No reason to call Supabase for them.
  const cookieStore = await cookies()
  const hasAuthCookie = cookieStore
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token") && !!c.value)

  if (hasAuthCookie) {
    // Verify the session is real (resilient: falls back to cookie-decoded
    // session if the Supabase Auth API is slow — see lib/supabase/server.ts).
    const user = await getUser()
    if (user) {
      redirect("/dashboard")
    }
    // Cookie exists but session is invalid (expired refresh token, etc.) —
    // fall through and render the landing page so the user can sign in again.
  }

  return (
    <>
      <HomePageClient />
      {/* A-ADS adaptive banner unit 2457981 — the landing page renders
          outside the (public) route group, so mount it explicitly. */}
      <AAdsAdaptiveUnit />
      {/* A-ADS dismissable sticky/anchor unit at the top of the viewport. */}
      <AAdsStickyUnit />
      {/* Adsterra real placements — intrusive units suppressed on the
          first-touch landing page (no popunder/social bar here). */}
      <AdsterraUnits disableIntrusive />
    </>
  )
}

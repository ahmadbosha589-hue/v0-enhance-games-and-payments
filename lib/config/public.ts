// Public configuration that can be safely exposed to the client
// These values are fetched server-side and passed to client components

export async function getPublicConfig() {
  "use server"

  return {
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "",
  }
}

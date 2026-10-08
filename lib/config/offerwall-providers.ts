/**
 * Offerwall provider registry — the single place that decides whether a wall
 * shown on the site can actually pay a user.
 *
 * WHY THIS EXISTS
 * `app/api/offerwalls/route.ts` advertised 22 walls but
 * `app/api/postback/[provider]/route.ts` could only verify 14 providers. The
 * other 8 rendered as normal, clickable "View Offers" buttons — a user could
 * complete an offer and earn nothing, with no error anywhere. One more
 * (`adgatemedia`) had a handler under a DIFFERENT key (`adgate`), so its
 * postback URL 400'd ("Invalid provider").
 *
 * A wall is only ever served when `supported === true`, i.e. there is a
 * matching `case` in the postback route for `postbackSlug`. `tests/offerwall-
 * coverage.test.ts` asserts this registry and the postback route cannot drift.
 */

export interface OfferwallProvider {
  /** `id` of the wall in app/api/offerwalls/route.ts. */
  wallId: string
  /**
   * The key that MUST appear in the postback URL (`/api/postback/<slug>`) and
   * that `app/api/postback/[provider]/route.ts` switches on.
   */
  postbackSlug: string
  /** Env var holding the postback signing secret. "" when unsupported. */
  secretEnv: string
}

export const OFFERWALL_PROVIDERS: OfferwallProvider[] = [
  // ── Supported: a postback handler exists for postbackSlug ──────────────────
  { wallId: "ccxua", postbackSlug: "ccxua", secretEnv: "CCXUA_SECRET_KEY" },
  { wallId: "cpx", postbackSlug: "cpx-research", secretEnv: "CPX_SECRET_KEY" },
  { wallId: "torox", postbackSlug: "torox", secretEnv: "TOROX_SECRET_KEY" },
  // NOTE: the wall id is "adgatemedia" but the handler key is "adgate". The
  // postback URL must therefore use "adgate". Keep this in lockstep with
  // app/api/postback/[provider]/route.ts.
  { wallId: "adgatemedia", postbackSlug: "adgate", secretEnv: "ADGATE_SECRET_KEY" },
  { wallId: "lootably", postbackSlug: "lootably", secretEnv: "LOOTABLY_SECRET_KEY" },
  { wallId: "bitlabs", postbackSlug: "bitlabs", secretEnv: "BITLABS_SECRET_KEY" },
  { wallId: "notik", postbackSlug: "notik", secretEnv: "NOTIK_SECRET_KEY" },
  { wallId: "timewall", postbackSlug: "timewall", secretEnv: "TIMEWALL_SECRET_KEY" },
  { wallId: "ayet", postbackSlug: "ayet-studios", secretEnv: "AYET_STUDIOS_SECRET_KEY" },
  { wallId: "hangmyads", postbackSlug: "hang-my-ads", secretEnv: "HANG_MY_ADS_SECRET_KEY" },
  { wallId: "offerwallme", postbackSlug: "offerwall-me", secretEnv: "OFFERWALLME_SECRET_KEY" },
  { wallId: "bicotasks", postbackSlug: "bicotasks", secretEnv: "BICOTASKS_SECRET_KEY" },
  { wallId: "mmwall", postbackSlug: "mm-wall", secretEnv: "MM_WALL_SECRET_KEY" },
  { wallId: "adscend", postbackSlug: "adscend", secretEnv: "ADSCEND_SECRET_KEY" },

  // ── Unsupported: advertised in the past but NO postback handler exists ─────
  // These are NOT served to users (postbackSupported=false). To enable one,
  // implement its validateSignature + parsePostbackParams cases in
  // app/api/postback/[provider]/route.ts, add the slug to `validProviders`,
  // give it a secretEnv here, then flip `supported`.
  { wallId: "wannads", postbackSlug: "wannads", secretEnv: "" },
  { wallId: "monlix", postbackSlug: "monlix", secretEnv: "" },
  { wallId: "revu", postbackSlug: "revu", secretEnv: "" },
  { wallId: "adgem", postbackSlug: "adgem", secretEnv: "" },
  { wallId: "pollfish", postbackSlug: "pollfish", secretEnv: "" },
  { wallId: "theoremreach", postbackSlug: "theoremreach", secretEnv: "" },
  { wallId: "cpalead", postbackSlug: "cpalead", secretEnv: "" },
  { wallId: "minutestaff", postbackSlug: "minutestaff", secretEnv: "" },
]

/** postbackSlug -> provider, for O(1) lookup. */
export const PROVIDER_BY_WALL_ID: Record<string, OfferwallProvider> = Object.fromEntries(
  OFFERWALL_PROVIDERS.map((p) => [p.wallId, p]),
)

/** True only when a postback handler exists for this wall. */
export function isPostbackSupported(wallId: string): boolean {
  return !!PROVIDER_BY_WALL_ID[wallId]?.secretEnv
}

/** The slug the postback URL must use for this wall (falls back to the id). */
export function postbackSlugFor(wallId: string): string {
  return PROVIDER_BY_WALL_ID[wallId]?.postbackSlug || wallId
}

/** Every slug the postback route is expected to handle. */
export const SUPPORTED_POSTBACK_SLUGS = OFFERWALL_PROVIDERS.filter((p) => p.secretEnv).map(
  (p) => p.postbackSlug,
)
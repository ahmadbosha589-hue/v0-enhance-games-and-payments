import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Feed a scoring event into every active tournament whose category matches.
 *
 * Contract identical to the claim route's inline scorer
 * (app/api/claim/route.ts updateTournamentScores): fire-and-forget via
 * Promise.allSettled — tournament scoring must never block or fail the
 * reward the user just earned. The reward is credited FIRST; this is a
 * post-credit best-effort mirror.
 *
 * Surfaces:
 *  - "claim":   counts raw claim-like events (delta always 1) into
 *               faucet_claims, and satoshis into highest_earners.
 *  - "earning": counts nothing into faucet_claims; satoshis go into
 *               highest_earners (and offerwall-style surfaces pass their
 *               own category via `extraCategory`).
 *
 * RPC signature (scripts/061_create_tournaments_table.sql:192):
 *   update_tournament_score(p_user_id UUID, p_category tournament_category,
 *                           p_period tournament_period, p_score_delta BIGINT)
 */
export type TournamentEarningKind = "claim" | "earning"

export async function recordTournamentEarning(
  supabase: SupabaseClient,
  userId: string,
  kind: TournamentEarningKind,
  satoshis: number,
  extraCategory?:
    | "offerwall_earnings"
    | "supporter_earnings"
    | "supporter_ads_watched",
): Promise<void> {
  try {
    const periods = ["daily", "weekly", "monthly"] as const
    const calls = [
      // faucet_claims — only claim-like events count claims (delta 1)
      ...(kind === "claim"
        ? periods.map((period) =>
            supabase.rpc("update_tournament_score", {
              p_user_id: userId,
              p_category: "faucet_claims",
              p_period: period,
              p_score_delta: 1,
            }),
          )
        : []),
      // highest_earners — tracks total satoshis earned from all sources
      ...periods.map((period) =>
        supabase.rpc("update_tournament_score", {
          p_user_id: userId,
          p_category: "highest_earners",
          p_period: period,
          p_score_delta: satoshis,
        }),
      ),
      // Surface-specific category (e.g. offerwall_earnings from postbacks)
      ...(extraCategory
        ? periods.map((period) =>
            supabase.rpc("update_tournament_score", {
              p_user_id: userId,
              p_category: extraCategory,
              p_period: period,
              p_score_delta: kind === "claim" ? 1 : satoshis,
            }),
          )
        : []),
    ]
    await Promise.allSettled(calls)
  } catch {
    // Non-fatal by contract: never block the reward the user just earned.
  }
}

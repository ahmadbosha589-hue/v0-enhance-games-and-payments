-- 085: Restrict balance/reward SECURITY DEFINER RPCs to the server-role path.
-- PostgreSQL grants EXECUTE on newly created functions to PUBLIC by default;
-- explicit REVOKE statements are required for a fail-closed reward surface.

REVOKE ALL ON FUNCTION public.add_game_reward(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_game_reward(UUID, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.atomic_claim(UUID, INET, TEXT, TEXT, BIGINT, BIGINT, BIGINT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_claim(UUID, INET, TEXT, TEXT, BIGINT, BIGINT, BIGINT, INTEGER, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.process_referral_commission(UUID, UUID, BIGINT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_commission(UUID, UUID, BIGINT, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.safe_add_balance(UUID, BIGINT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_add_balance(UUID, BIGINT, TEXT, TEXT, JSONB, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.modify_user_balance(UUID, BIGINT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modify_user_balance(UUID, BIGINT, TEXT, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.complete_shortlink_view(UUID, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_shortlink_view(UUID, UUID, TEXT, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.complete_ptc_view(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ptc_view(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_game_reward(UUID, UUID, INTEGER, TEXT, BOOLEAN, INTEGER, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_game_reward(UUID, UUID, INTEGER, TEXT, BOOLEAN, INTEGER, INTEGER, TIMESTAMPTZ) TO service_role;

-- Prevent referral replay at the ledger boundary.
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_bonus_claim_unique
  ON public.transactions (claim_id, user_id, type)
  WHERE type = 'referral_bonus' AND claim_id IS NOT NULL;

-- Stable claim idempotency is enforced by the existing unique transaction key;
-- retain a supporting lookup index for server retries.
CREATE INDEX IF NOT EXISTS idx_transactions_user_idempotency
  ON public.transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

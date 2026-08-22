-- 098: Multi-tier referrals (10% / 5% / 2%) + real streak bonus.
--
-- Launch directive: the referrals UI promises 10/5/2 tiers and the earn page
-- promises streak bonuses — both are now implemented for real.
--
-- process_referral_commission keeps its existing signature so every existing
-- caller keeps working: p_commission_rate is honored as the TIER-1 rate and
-- tiers 2/3 derive from it (rate/2, rate/5 => 10%/5%/2% when called with 0.10,
-- and still sensible proportions for any other rate).
--
-- atomic_claim: the claim API hard-zeroes streak bonuses today. Rather than
-- duplicating the whole 080 implementation, we rename it to
-- atomic_claim_impl and put a thin wrapper in front that computes the REAL
-- server-side streak bonus from claim history (UTC day boundaries) and passes
-- it down. Booster bonuses from 080 keep working untouched. The wrapper keeps
-- the exact original signature, so no caller changes.

-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-tier referral commissions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_referral_commission(
  p_claim_id UUID,
  p_referrer_id UUID,
  p_claim_amount BIGINT,
  p_commission_rate NUMERIC DEFAULT 0.10
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim public.claims%ROWTYPE;
  v_claimant public.profiles%ROWTYPE;
  v_ancestor_id UUID;
  v_ancestor public.profiles%ROWTYPE;
  v_rate NUMERIC;
  v_commission BIGINT;
  v_total BIGINT := 0;
  v_paid INT := 0;
  v_results JSONB := '[]'::JSONB;
  v_tx_id UUID;
  v_level INT;
  v_idem TEXT;
BEGIN
  IF p_commission_rate IS NULL OR p_commission_rate <= 0 OR p_commission_rate > 0.25 OR p_claim_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_COMMISSION');
  END IF;

  SELECT * INTO v_claim FROM public.claims WHERE id = p_claim_id;
  IF NOT FOUND OR v_claim.amount_satoshis <> p_claim_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'CLAIM_MISMATCH');
  END IF;

  SELECT * INTO v_claimant FROM public.profiles WHERE id = v_claim.user_id;
  IF NOT FOUND OR v_claimant.referred_by <> p_referrer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'REFERRAL_MISMATCH');
  END IF;

  -- Idempotency: any existing tier-1 row for this claim short-circuits.
  SELECT id INTO v_tx_id
  FROM public.transactions
  WHERE claim_id = p_claim_id AND user_id = p_referrer_id AND type = 'referral_bonus';
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'commission', 0, 'transaction_id', v_tx_id, 'duplicate', true);
  END IF;

  -- Walk the referral chain: tier 1 = p_referrer_id, then referred_by chain.
  v_ancestor_id := p_referrer_id;
  v_rate := p_commission_rate;

  FOR v_level IN 1..3 LOOP
    EXIT WHEN v_ancestor_id IS NULL;

    SELECT * INTO v_ancestor FROM public.profiles WHERE id = v_ancestor_id FOR UPDATE;
    IF NOT FOUND OR v_ancestor.status <> 'active' THEN
      EXIT;
    END IF;

    v_commission := FLOOR(p_claim_amount * v_rate)::BIGINT;

    IF v_commission >= 1 THEN
      v_idem := 'ref:' || p_claim_id::TEXT || ':L' || v_level;

      UPDATE public.profiles
      SET balance_satoshis = COALESCE(balance_satoshis, 0) + v_commission,
          total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + v_commission,
          referral_earnings_satoshis = COALESCE(referral_earnings_satoshis, 0) + v_commission,
          updated_at = NOW()
      WHERE id = v_ancestor.id;

      INSERT INTO public.transactions (
        user_id, type, amount_satoshis, balance_before, balance_after,
        claim_id, status, description, idempotency_key, completed_at
      ) VALUES (
        v_ancestor.id, 'referral_bonus', v_commission,
        v_ancestor.balance_satoshis, v_ancestor.balance_satoshis + v_commission,
        p_claim_id, 'completed',
        'Referral commission (tier ' || v_level || ')', v_idem, NOW()
      ) RETURNING id INTO v_tx_id;

      v_total := v_total + v_commission;
      v_paid := v_paid + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'tier', v_level, 'user', v_ancestor.id, 'commission', v_commission, 'transaction_id', v_tx_id
      ));
    END IF;

    -- Advance up the chain; tier rates: 10% -> 5% -> 2% (rate, rate/2, rate/5).
    v_ancestor_id := v_ancestor.referred_by;
    IF v_level = 1 THEN
      v_rate := p_commission_rate / 2;
    ELSIF v_level = 2 THEN
      v_rate := p_commission_rate / 5;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'commission', v_total,
    'tiers_paid', v_paid,
    'tiers', v_results
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Real streak bonus: rename the 080 implementation to atomic_claim_impl and
-- wrap it with a server-authoritative streak computation.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronounspace
    WHERE n.nspname = 'public' AND p.proname = 'atomic_claim'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronounspace
    WHERE n.nspname = 'public' AND p.proname = 'atomic_claim_impl'
  ) THEN
    ALTER FUNCTION public.atomic_claim(UUID, INET, TEXT, TEXT, BIGINT, BIGINT, BIGINT, INTEGER, TEXT)
      RENAME TO atomic_claim_impl;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.atomic_claim(
  p_user_id UUID,
  p_ip_address INET,
  p_device_fingerprint TEXT,
  p_user_agent TEXT,
  p_base_amount BIGINT,
  p_streak_bonus BIGINT DEFAULT 0,
  p_referral_bonus BIGINT DEFAULT 0,
  p_fraud_score INTEGER DEFAULT 0,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_server_streak_bonus BIGINT;
  v_last_claim TIMESTAMPTZ;
  v_days_diff INT;
  v_prior_streak_days INT;
BEGIN
  -- Compute the REAL streak bonus from actual claim history (UTC dates),
  -- independent of whatever the API passed in p_streak_bonus.
  SELECT MAX(created_at) INTO v_last_claim FROM public.claims WHERE user_id = p_user_id;

  IF v_last_claim IS NULL THEN
    v_server_streak_bonus := 1;                       -- first claim ever
  ELSE
    v_days_diff := ((NOW() AT TIME ZONE 'UTC')::DATE - (v_last_claim AT TIME ZONE 'UTC')::DATE);
    IF v_days_diff <= 0 THEN
      v_server_streak_bonus := 0;                     -- already claimed today
    ELSIF v_days_diff = 1 THEN
      -- Consecutive day: 1 sat per active streak day, capped at 7 sats.
      -- Active streak length = distinct UTC days claimed on/after (today - streak window).
      SELECT COUNT(DISTINCT (created_at AT TIME ZONE 'UTC')::DATE)
        INTO v_prior_streak_days
        FROM public.claims
       WHERE user_id = p_user_id
         AND (created_at AT TIME ZONE 'UTC')::DATE >= (NOW() AT TIME ZONE 'UTC')::DATE - 7;
      v_server_streak_bonus := LEAST(7, GREATEST(1, v_prior_streak_days));
    ELSE
      v_server_streak_bonus := 1;                     -- streak broken, restart at 1
    END IF;
  END IF;

  -- Delegate to the 080 implementation with the server-authoritative bonus;
  -- booster percentage logic inside it keeps working unchanged.
  v_result := public.atomic_claim_impl(
    p_user_id, p_ip_address, p_device_fingerprint, p_user_agent,
    p_base_amount, v_server_streak_bonus, p_referral_bonus, p_fraud_score, p_idempotency_key
  );

  IF v_result IS NOT NULL AND (v_result->>'success')::BOOLEAN IS TRUE THEN
    v_result := jsonb_set(v_result, '{server_streak_bonus}', to_jsonb(v_server_streak_bonus));
  END IF;
  RETURN v_result;
END;
$$;

-- Keep the RPC surface service-role only, matching the 085/092/093 posture.
REVOKE ALL ON FUNCTION public.process_referral_commission(UUID, UUID, BIGINT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_commission(UUID, UUID, BIGINT, NUMERIC) TO service_role;
REVOKE ALL ON FUNCTION public.atomic_claim_impl(UUID, INET, TEXT, TEXT, BIGINT, BIGINT, BIGINT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_claim_impl(UUID, INET, TEXT, TEXT, BIGINT, BIGINT, BIGINT, INTEGER, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.atomic_claim(UUID, INET, TEXT, TEXT, BIGINT, BIGINT, BIGINT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_claim(UUID, INET, TEXT, TEXT, BIGINT, BIGINT, BIGINT, INTEGER, TEXT) TO service_role;

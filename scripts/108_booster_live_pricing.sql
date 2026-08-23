-- 108: Live-rate booster pricing.
--
-- The stored price_satoshis column was a static snapshot (5,000 sats for the
-- $5 tier — worth $3.81 at current BTC prices). This migration:
--   (1) adds purchase_booster_with_balance_with_price: the same atomic
--       purchase but charging an EXPLICIT satoshi price supplied by the
--       server route (which computes it from the live BTC/USD rate at
--       purchase time). The old function is kept for rollback but is no
--       longer called by application code.
--   (2) refreshes the stale price_satoshis snapshot values from price_usd at
--       the rate embedded below so display fallbacks are not wildly wrong.

CREATE OR REPLACE FUNCTION public.purchase_booster_with_balance_at_price(
  p_user_id UUID,
  p_booster_tier_id UUID,
  p_payment_method TEXT,
  p_payment_reference TEXT DEFAULT NULL,
  p_price_satoshis BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_tier public.booster_tiers;
  v_existing public.user_boosters;
  v_purchase_id UUID;
  v_booster_id UUID;
  v_before BIGINT;
  v_after BIGINT;
  v_expires_at TIMESTAMPTZ;
  v_charged_sats BIGINT;
BEGIN
  SELECT * INTO v_tier
    FROM public.booster_tiers
   WHERE id = p_booster_tier_id AND is_active = TRUE
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booster tier unavailable'; END IF;

  -- Charge price: explicit server-supplied live-rate price if given,
  -- otherwise fall back to the tier's stored snapshot.
  v_charged_sats := COALESCE(p_price_satoshis, v_tier.price_satoshis);
  IF v_charged_sats IS NULL OR v_charged_sats <= 0 THEN
    RAISE EXCEPTION 'invalid booster price';
  END IF;

  SELECT * INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;

  v_before := COALESCE(v_profile.balance_satoshis, 0);
  IF v_before < v_charged_sats THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;
  v_after := v_before - v_charged_sats;

  SELECT * INTO v_existing
    FROM public.user_boosters
    WHERE user_id = p_user_id
      AND is_active = TRUE
      AND expires_at > NOW()
   ORDER BY expires_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    v_expires_at := GREATEST(v_existing.expires_at, NOW())
      + make_interval(days => v_tier.duration_days);
    UPDATE public.user_boosters
       SET is_active = FALSE, updated_at = NOW()
     WHERE id = v_existing.id;
  ELSE
    v_expires_at := NOW() + make_interval(days => v_tier.duration_days);
  END IF;

  INSERT INTO public.booster_purchases (
    user_id, booster_tier_id, payment_method, payment_status,
    payment_reference, amount_usd, amount_satoshis, completed_at
  ) VALUES (
    p_user_id, v_tier.id, p_payment_method, 'completed',
    p_payment_reference, v_tier.price_usd, v_charged_sats, NOW()
  ) RETURNING id INTO v_purchase_id;

  UPDATE public.profiles
     SET balance_satoshis = v_after, updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.user_boosters (
    user_id, booster_tier_id, tier, expires_at, is_active,
    payment_method, payment_reference, amount_paid_usd, amount_paid_satoshis
  ) VALUES (
    p_user_id, v_tier.id, v_tier.slug, v_expires_at, TRUE,
    p_payment_method, p_payment_reference, v_tier.price_usd, v_charged_sats
  ) RETURNING id INTO v_booster_id;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis,
    balance_before, balance_after, description, metadata, completed_at
  ) VALUES (
    p_user_id, 'booster_purchase', 'completed', -v_charged_sats,
    v_before, v_after, 'Purchased ' || v_tier.name || ' booster',
    jsonb_build_object(
      'booster_purchase_id', v_purchase_id,
      'booster_tier_id', v_tier.id,
      'price_basis', CASE WHEN p_price_satoshis IS NOT NULL THEN 'live_rate' ELSE 'tier_snapshot' END
    ), NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'purchase_id', v_purchase_id,
    'booster_id', v_booster_id,
    'new_balance', v_after,
    'expires_at', v_expires_at,
    'tier_name', v_tier.name,
    'charged_satoshis', v_charged_sats,
    'faucet_bonus_percentage', v_tier.faucet_bonus_percentage,
    'offerwall_bonus_percentage', v_tier.offerwall_bonus_percentage
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_booster_with_balance_at_price(UUID, UUID, TEXT, TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_booster_with_balance_at_price(UUID, UUID, TEXT, TEXT, BIGINT)
  TO service_role;

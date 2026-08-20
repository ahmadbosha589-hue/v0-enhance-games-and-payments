-- Atomic booster purchase and external-payment activation.
-- This migration makes the booster purchase lifecycle durable:
-- balance purchase -> purchase row -> active booster -> transaction
-- external confirmation -> purchase row -> active booster.

CREATE OR REPLACE FUNCTION public.purchase_booster_with_balance(
  p_user_id UUID,
  p_booster_tier_id UUID,
  p_payment_method TEXT,
  p_payment_reference TEXT DEFAULT NULL
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
BEGIN
  SELECT * INTO v_tier
    FROM public.booster_tiers
   WHERE id = p_booster_tier_id AND is_active = TRUE
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booster tier unavailable'; END IF;

  SELECT * INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;

  v_before := COALESCE(v_profile.balance_satoshis, 0);
  IF v_before < v_tier.price_satoshis THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;
  v_after := v_before - v_tier.price_satoshis;

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
    p_payment_reference, v_tier.price_usd, v_tier.price_satoshis, NOW()
  ) RETURNING id INTO v_purchase_id;

  UPDATE public.profiles
     SET balance_satoshis = v_after, updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.user_boosters (
    user_id, booster_tier_id, tier, expires_at, is_active,
    payment_method, payment_reference, amount_paid_usd, amount_paid_satoshis
  ) VALUES (
    p_user_id, v_tier.id, v_tier.slug, v_expires_at, TRUE,
    p_payment_method, p_payment_reference, v_tier.price_usd, v_tier.price_satoshis
  ) RETURNING id INTO v_booster_id;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis,
    balance_before, balance_after, description, metadata, completed_at
  ) VALUES (
    p_user_id, 'booster_purchase', 'completed', -v_tier.price_satoshis,
    v_before, v_after, 'Purchased ' || v_tier.name || ' booster',
    jsonb_build_object('booster_purchase_id', v_purchase_id, 'booster_tier_id', v_tier.id), NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'purchase_id', v_purchase_id,
    'booster_id', v_booster_id,
    'new_balance', v_after,
    'expires_at', v_expires_at,
    'tier_name', v_tier.name,
    'faucet_bonus_percentage', v_tier.faucet_bonus_percentage,
    'offerwall_bonus_percentage', v_tier.offerwall_bonus_percentage
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_booster_purchase(
  p_payment_reference TEXT,
  p_transaction_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.booster_purchases;
  v_tier public.booster_tiers;
  v_existing public.user_boosters;
  v_booster_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_purchase
    FROM public.booster_purchases
   WHERE payment_reference = p_payment_reference
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booster purchase not found'; END IF;

  IF v_purchase.payment_status = 'completed' THEN
    SELECT id, expires_at INTO v_booster_id, v_expires_at
      FROM public.user_boosters
     WHERE payment_reference = p_payment_reference
     ORDER BY created_at DESC
     LIMIT 1;
    RETURN jsonb_build_object(
      'success', TRUE,
      'already_active', TRUE,
      'purchase_id', v_purchase.id,
      'booster_id', v_booster_id,
      'expires_at', v_expires_at
    );
  END IF;

  IF v_purchase.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'booster purchase is not payable';
  END IF;

  SELECT * INTO v_tier FROM public.booster_tiers WHERE id = v_purchase.booster_tier_id;
  IF NOT FOUND OR NOT v_tier.is_active THEN RAISE EXCEPTION 'booster tier unavailable'; END IF;

  SELECT * INTO v_existing
    FROM public.user_boosters
   WHERE user_id = v_purchase.user_id
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

  INSERT INTO public.user_boosters (
    user_id, booster_tier_id, tier, expires_at, is_active,
    payment_method, payment_reference, amount_paid_usd, amount_paid_satoshis
  ) VALUES (
    v_purchase.user_id, v_tier.id, v_tier.slug, v_expires_at, TRUE,
    v_purchase.payment_method, v_purchase.payment_reference,
    v_tier.price_usd, v_tier.price_satoshis
  ) RETURNING id INTO v_booster_id;

  UPDATE public.booster_purchases
     SET payment_status = 'completed',
         transaction_hash = COALESCE(p_transaction_hash, transaction_hash),
         completed_at = NOW()
   WHERE id = v_purchase.id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'already_active', FALSE,
    'purchase_id', v_purchase.id,
    'booster_id', v_booster_id,
    'expires_at', v_expires_at,
    'tier_name', v_tier.name,
    'faucet_bonus_percentage', v_tier.faucet_bonus_percentage,
    'offerwall_bonus_percentage', v_tier.offerwall_bonus_percentage
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_booster_with_balance(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_booster_purchase(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- Apply active booster faucet bonuses inside the atomic claim transaction.

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS booster_bonus_satoshis BIGINT NOT NULL DEFAULT 0;

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
  v_lock_id BIGINT;
  v_profile public.profiles%ROWTYPE;
  v_last_claim_at TIMESTAMPTZ;
  v_cooldown_seconds INTEGER := 300;
  v_seconds_remaining INTEGER;
  v_total_amount BIGINT;
  v_booster_bonus BIGINT := 0;
  v_booster_percentage INTEGER := 0;
  v_new_streak INTEGER;
  v_claim_id UUID;
  v_transaction_id UUID;
  v_last_claim_date DATE;
  v_today_date DATE;
  v_days_diff INTEGER;
BEGIN
  v_lock_id := ('x' || substr(md5(p_user_id::text), 1, 15))::bit(60)::bigint;
  IF NOT pg_try_advisory_xact_lock(v_lock_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'CLAIM_IN_PROGRESS', 'message', 'Another claim is being processed');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_claim_id
      FROM public.claims
     WHERE user_id = p_user_id
       AND device_fingerprint IS NOT DISTINCT FROM p_device_fingerprint
       AND created_at > NOW() - INTERVAL '1 hour'
     LIMIT 1;
    IF v_claim_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'DUPLICATE_CLAIM', 'message', 'This claim has already been processed');
    END IF;
  END IF;

  SELECT * INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', 'User profile not found');
  END IF;
  IF v_profile.status = 'banned' THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_BANNED', 'message', 'Your account has been suspended');
  END IF;

  v_last_claim_at := v_profile.last_claim_at;
  IF v_last_claim_at IS NOT NULL THEN
    v_seconds_remaining := GREATEST(0, v_cooldown_seconds - EXTRACT(EPOCH FROM (NOW() - v_last_claim_at))::INTEGER);
    IF v_seconds_remaining > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'COOLDOWN_ACTIVE',
        'message', 'Please wait before claiming again',
        'seconds_remaining', v_seconds_remaining,
        'next_claim_at', v_last_claim_at + (v_cooldown_seconds || ' seconds')::INTERVAL
      );
    END IF;
  END IF;

  v_today_date := (NOW() AT TIME ZONE 'UTC')::DATE;
  IF v_last_claim_at IS NULL THEN
    v_new_streak := 1;
  ELSE
    v_last_claim_date := (v_last_claim_at AT TIME ZONE 'UTC')::DATE;
    v_days_diff := v_today_date - v_last_claim_date;
    IF v_days_diff = 0 THEN
      v_new_streak := COALESCE(v_profile.claim_streak, 1);
    ELSIF v_days_diff = 1 THEN
      v_new_streak := LEAST(COALESCE(v_profile.claim_streak, 0) + 1, 30);
    ELSE
      v_new_streak := 1;
    END IF;
  END IF;

  SELECT COALESCE(bt.faucet_bonus_percentage, 0)
    INTO v_booster_percentage
    FROM public.user_boosters ub
    JOIN public.booster_tiers bt ON bt.id = ub.booster_tier_id
   WHERE ub.user_id = p_user_id
     AND ub.is_active = TRUE
     AND ub.expires_at > NOW()
     AND bt.is_active = TRUE
   ORDER BY ub.expires_at DESC
   LIMIT 1;

  v_booster_bonus := FLOOR(
    (p_base_amount + p_streak_bonus + p_referral_bonus)
    * GREATEST(v_booster_percentage, 0) / 100.0
  )::BIGINT;
  v_total_amount := p_base_amount + p_streak_bonus + p_referral_bonus + v_booster_bonus;

  INSERT INTO public.claims (
    user_id, ip_address, device_fingerprint, user_agent,
    base_amount_satoshis, streak_bonus_satoshis, referral_bonus_satoshis,
    booster_bonus_satoshis, amount_satoshis, streak_day, fraud_score, is_flagged
  ) VALUES (
    p_user_id, p_ip_address, p_device_fingerprint, p_user_agent,
    p_base_amount, p_streak_bonus, p_referral_bonus,
    v_booster_bonus, v_total_amount, v_new_streak, p_fraud_score, p_fraud_score > 70
  ) RETURNING id INTO v_claim_id;

  UPDATE public.profiles SET
    balance_satoshis = balance_satoshis + v_total_amount,
    total_earned_satoshis = total_earned_satoshis + v_total_amount,
    total_claims = total_claims + 1,
    claim_streak = v_new_streak,
    max_claim_streak = GREATEST(max_claim_streak, v_new_streak),
    last_claim_at = NOW(),
    last_active_at = NOW(),
    updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.transactions (
    user_id, type, amount_satoshis, balance_before, balance_after,
    claim_id, status, idempotency_key, description, metadata
  ) VALUES (
    p_user_id, 'claim', v_total_amount,
    v_profile.balance_satoshis, v_profile.balance_satoshis + v_total_amount,
    v_claim_id, 'completed', p_idempotency_key,
    'Faucet claim - Day ' || v_new_streak || ' streak',
    jsonb_build_object('booster_bonus_satoshis', v_booster_bonus, 'booster_percentage', v_booster_percentage)
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'transaction_id', v_transaction_id,
    'amount', v_total_amount,
    'base_amount', p_base_amount,
    'streak_bonus', p_streak_bonus,
    'referral_bonus', p_referral_bonus,
    'booster_bonus', v_booster_bonus,
    'booster_percentage', v_booster_percentage,
    'streak_day', v_new_streak,
    'new_balance', v_profile.balance_satoshis + v_total_amount,
    'next_claim_at', NOW() + (v_cooldown_seconds || ' seconds')::INTERVAL
  );
END;
$$;

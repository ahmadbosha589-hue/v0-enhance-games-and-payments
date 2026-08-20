-- 086: Atomic bonus/coupon/achievement/referral fulfillment.

CREATE OR REPLACE FUNCTION public.add_game_reward(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before BIGINT;
  v_after BIGINT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Invalid reward amount' USING ERRCODE = '22023';
  END IF;

  SELECT balance_satoshis INTO v_before
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  v_after := COALESCE(v_before, 0) + p_amount;

  UPDATE public.profiles
  SET balance_satoshis = v_after,
      total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis, balance_before, balance_after,
    description, completed_at
  ) VALUES (
    p_user_id, 'bonus', 'completed', p_amount, v_before, v_after,
    'Reward credit', NOW()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_daily_bonus(
  p_user_id UUID,
  p_amount INTEGER,
  p_ip_address TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_before BIGINT;
  v_after BIGINT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_amount IS NULL OR p_amount < 2 OR p_amount > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT', 'message', 'Invalid daily bonus amount');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', 'Profile not found');
  END IF;
  IF v_profile.status <> 'active' OR (v_profile.is_flagged AND v_profile.fraud_score >= 70) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_RESTRICTED', 'message', 'Account is not eligible');
  END IF;
  IF v_profile.last_daily_bonus_at IS NOT NULL
     AND v_profile.last_daily_bonus_at > v_now - INTERVAL '24 hours' THEN
    RETURN jsonb_build_object('success', false, 'error', 'COOLDOWN_ACTIVE', 'message', 'Daily bonus already claimed');
  END IF;

  v_before := COALESCE(v_profile.balance_satoshis, 0);
  v_after := v_before + p_amount;

  UPDATE public.profiles
  SET balance_satoshis = v_after,
      total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + p_amount,
      last_daily_bonus_at = v_now,
      total_daily_bonuses = COALESCE(total_daily_bonuses, 0) + 1,
      last_active_at = v_now,
      updated_at = v_now
  WHERE id = p_user_id;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis, balance_before, balance_after,
    description, metadata, completed_at
  ) VALUES (
    p_user_id, 'daily_bonus', 'completed', p_amount, v_before, v_after,
    'Daily bonus claim', jsonb_build_object('ip_address', p_ip_address), v_now
  );

  RETURN jsonb_build_object('success', true, 'amount', p_amount, 'new_balance', v_after, 'total_bonuses', COALESCE(v_profile.total_daily_bonuses, 0) + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_coupon_atomic(
  p_user_id UUID,
  p_code TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id BIGINT;
  v_coupon public.coupons%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_before BIGINT;
  v_after BIGINT;
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_count INTEGER;
  v_redemption_id UUID;
  v_tx_id UUID;
BEGIN
  v_lock_id := ('x' || substr(md5(p_user_id::text), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_id);

  IF p_code IS NULL OR length(trim(p_code)) < 6 OR length(trim(p_code)) > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CODE', 'message', 'Invalid coupon code format');
  END IF;

  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE upper(code) = upper(trim(p_code)) AND is_active = TRUE
  FOR UPDATE;

  IF NOT FOUND OR (v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at <= NOW()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_COUPON', 'message', 'Invalid or expired coupon code');
  END IF;
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.current_uses >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'MAX_USES', 'message', 'Coupon usage limit reached');
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.coupon_redemptions
  WHERE user_id = p_user_id AND redeemed_at >= v_today_start;
  IF v_count >= 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'DAILY_LIMIT', 'message', 'Daily coupon limit reached');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_RESTRICTED', 'message', 'Account is not active');
  END IF;

  BEGIN
    INSERT INTO public.coupon_redemptions (user_id, coupon_id, reward_satoshis, ip_address, user_agent)
    VALUES (p_user_id, v_coupon.id, v_coupon.reward_satoshis, p_ip_address, p_user_agent)
    RETURNING id INTO v_redemption_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REDEEMED', 'message', 'You have already redeemed this coupon');
  END;

  UPDATE public.coupons SET current_uses = current_uses + 1 WHERE id = v_coupon.id;
  v_before := COALESCE(v_profile.balance_satoshis, 0);
  v_after := v_before + v_coupon.reward_satoshis;

  UPDATE public.profiles
  SET balance_satoshis = v_after,
      total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + v_coupon.reward_satoshis,
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis, balance_before, balance_after,
    description, metadata, completed_at
  ) VALUES (
    p_user_id, 'coupon', 'completed', v_coupon.reward_satoshis, v_before, v_after,
    'Coupon redemption', jsonb_build_object('coupon_id', v_coupon.id, 'redemption_id', v_redemption_id), NOW()
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'reward', v_coupon.reward_satoshis, 'new_balance', v_after, 'coupon_name', v_coupon.code, 'transaction_id', v_tx_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_achievement_atomic(
  p_user_id UUID,
  p_achievement_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement public.achievements%ROWTYPE;
  v_user_achievement public.user_achievements%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_progress BIGINT := 0;
  v_before BIGINT;
  v_after BIGINT;
  v_tx_id UUID;
BEGIN
  SELECT * INTO v_achievement FROM public.achievements WHERE id = p_achievement_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Achievement not found');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_RESTRICTED', 'message', 'Account is not active');
  END IF;

  CASE v_achievement.category
    WHEN 'claims' THEN v_progress := COALESCE(v_profile.total_claims, 0);
    WHEN 'streak' THEN v_progress := GREATEST(COALESCE(v_profile.claim_streak, 0), COALESCE(v_profile.max_claim_streak, 0));
    WHEN 'earnings' THEN v_progress := COALESCE(v_profile.total_earned_satoshis, 0);
    WHEN 'referrals' THEN v_progress := COALESCE(v_profile.referral_count, 0);
    WHEN 'withdrawals' THEN v_progress := COALESCE(v_profile.total_withdrawn_satoshis, 0);
    ELSE v_progress := 0;
  END CASE;

  SELECT * INTO v_user_achievement
  FROM public.user_achievements
  WHERE user_id = p_user_id AND achievement_id = p_achievement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF v_progress < v_achievement.requirement_value THEN
      RETURN jsonb_build_object('success', false, 'error', 'NOT_COMPLETED', 'message', 'Achievement not completed yet');
    END IF;
    INSERT INTO public.user_achievements (user_id, achievement_id, progress, completed, completed_at, reward_claimed)
    VALUES (p_user_id, p_achievement_id, v_progress, TRUE, NOW(), FALSE)
    RETURNING * INTO v_user_achievement;
  ELSIF v_user_achievement.reward_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_CLAIMED', 'message', 'Reward already claimed');
  ELSIF NOT v_user_achievement.completed AND v_progress < v_achievement.requirement_value THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_COMPLETED', 'message', 'Achievement not completed yet');
  ELSIF NOT v_user_achievement.completed THEN
    UPDATE public.user_achievements
    SET completed = TRUE, completed_at = NOW(), progress = v_progress
    WHERE id = v_user_achievement.id;
  END IF;

  UPDATE public.user_achievements
  SET reward_claimed = TRUE, reward_claimed_at = NOW(), progress = GREATEST(progress, v_progress)
  WHERE id = v_user_achievement.id AND reward_claimed = FALSE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_CLAIMED', 'message', 'Reward already claimed');
  END IF;

  v_before := COALESCE(v_profile.balance_satoshis, 0);
  v_after := v_before + COALESCE(v_achievement.reward_satoshis, 0);
  UPDATE public.profiles
  SET balance_satoshis = v_after,
      total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + COALESCE(v_achievement.reward_satoshis, 0),
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis, balance_before, balance_after,
    description, metadata, completed_at
  ) VALUES (
    p_user_id, 'achievement', 'completed', COALESCE(v_achievement.reward_satoshis, 0), v_before, v_after,
    'Achievement reward', jsonb_build_object('achievement_id', p_achievement_id, 'achievement_name', v_achievement.name), NOW()
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'reward', COALESCE(v_achievement.reward_satoshis, 0), 'new_balance', v_after, 'transaction_id', v_tx_id);
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_bonus_claim_unique
  ON public.transactions (claim_id, user_id, type)
  WHERE type = 'referral_bonus' AND claim_id IS NOT NULL;

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
  v_referrer public.profiles%ROWTYPE;
  v_commission BIGINT;
  v_tx_id UUID;
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

  SELECT id INTO v_tx_id
  FROM public.transactions
  WHERE claim_id = p_claim_id AND user_id = p_referrer_id AND type = 'referral_bonus';
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'commission', 0, 'transaction_id', v_tx_id, 'duplicate', true);
  END IF;

  SELECT * INTO v_referrer FROM public.profiles WHERE id = p_referrer_id FOR UPDATE;
  IF NOT FOUND OR v_referrer.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'REFERRER_NOT_FOUND');
  END IF;

  v_commission := FLOOR(p_claim_amount * p_commission_rate)::BIGINT;
  IF v_commission < 1 THEN
    RETURN jsonb_build_object('success', true, 'commission', 0);
  END IF;

  UPDATE public.profiles
  SET balance_satoshis = COALESCE(balance_satoshis, 0) + v_commission,
      total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + v_commission,
      referral_earnings_satoshis = COALESCE(referral_earnings_satoshis, 0) + v_commission,
      updated_at = NOW()
  WHERE id = p_referrer_id;

  INSERT INTO public.transactions (
    user_id, type, amount_satoshis, balance_before, balance_after, claim_id, status, description, completed_at
  ) VALUES (
    p_referrer_id, 'referral_bonus', v_commission,
    v_referrer.balance_satoshis, v_referrer.balance_satoshis + v_commission,
    p_claim_id, 'completed', 'Referral commission', NOW()
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'commission', v_commission, 'transaction_id', v_tx_id);
END;
$$;

REVOKE ALL ON FUNCTION public.add_game_reward(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_game_reward(UUID, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.complete_daily_bonus(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_daily_bonus(UUID, INTEGER, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.redeem_coupon_atomic(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon_atomic(UUID, TEXT, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.claim_achievement_atomic(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_achievement_atomic(UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.process_referral_commission(UUID, UUID, BIGINT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_commission(UUID, UUID, BIGINT, NUMERIC) TO service_role;

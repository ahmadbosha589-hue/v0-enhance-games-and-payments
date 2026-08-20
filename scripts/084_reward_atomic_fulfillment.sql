-- 084: Atomic reward fulfillment and signed-watch-session support.
-- This migration is additive and safe to re-run through the checksum-aware runner.

-- Legacy routes use these granular transaction labels. Keep existing enum values
-- intact and add only missing labels.
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'game_reward';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'double_reward';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'shortlink_bonus';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'ptc_bonus';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'daily_bonus_bonus';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'manual_faucet_bonus';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'coupon_bonus';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'ptc_milestone_bonus';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'game_bonus';

ALTER TABLE public.shortlink_views
  ADD COLUMN IF NOT EXISTS view_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Remove duplicate legacy rows before enforcing one completion per user/link/UTC day.
DELETE FROM public.shortlink_views
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, shortlink_id, date_trunc('day', viewed_at AT TIME ZONE 'UTC')
             ORDER BY viewed_at ASC, id ASC
           ) AS row_number
    FROM public.shortlink_views
  ) ranked
  WHERE row_number > 1
);

DELETE FROM public.ptc_views
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, ad_id, date_trunc('day', created_at AT TIME ZONE 'UTC')
             ORDER BY created_at ASC, id ASC
           ) AS row_number
    FROM public.ptc_views
  ) ranked
  WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shortlink_views_user_link_utc_day
  ON public.shortlink_views (
    user_id,
    shortlink_id,
    date_trunc('day', viewed_at AT TIME ZONE 'UTC')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_ptc_views_user_ad_utc_day
  ON public.ptc_views (
    user_id,
    ad_id,
    date_trunc('day', created_at AT TIME ZONE 'UTC')
  );

-- Atomic Shortlink completion. The caller must first verify a signed server
-- watch token and minimum elapsed time; this function owns all durable writes.
CREATE OR REPLACE FUNCTION public.complete_shortlink_view(
  p_user_id UUID,
  p_shortlink_id UUID,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_view_duration_ms INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id BIGINT;
  v_shortlink public.shortlinks%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_today_count INTEGER;
  v_before BIGINT;
  v_after BIGINT;
  v_view_id UUID;
  v_tx_id UUID;
  v_ip INET;
BEGIN
  v_lock_id := ('x' || substr(md5(p_user_id::text), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_id);

  SELECT * INTO v_shortlink
  FROM public.shortlinks
  WHERE id = p_shortlink_id AND is_active = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SHORTLINK_UNAVAILABLE', 'message', 'Shortlink is unavailable');
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_today_count
  FROM public.shortlink_views
  WHERE user_id = p_user_id AND viewed_at >= v_today_start;

  IF v_today_count >= 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'DAILY_LIMIT', 'message', 'Daily shortlink limit reached');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', 'Profile not found');
  END IF;

  BEGIN
    v_ip := CASE
      WHEN p_ip_address IS NULL OR p_ip_address = '' OR p_ip_address = 'unknown' THEN NULL
      WHEN p_ip_address ~ '^[0-9a-fA-F:.]+$' THEN p_ip_address::INET
      ELSE NULL
    END;

    INSERT INTO public.shortlink_views (
      user_id, shortlink_id, reward_satoshis, viewed_at, ip_address, view_duration_ms, user_agent
    ) VALUES (
      p_user_id, p_shortlink_id, v_shortlink.reward_satoshis, NOW(), v_ip, p_view_duration_ms, p_user_agent
    ) RETURNING id INTO v_view_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_COMPLETED', 'message', 'Shortlink already completed today');
  END;

  v_before := COALESCE(v_profile.balance_satoshis, 0);
  v_after := v_before + v_shortlink.reward_satoshis;

  UPDATE public.profiles
  SET balance_satoshis = v_after,
      total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + v_shortlink.reward_satoshis,
      updated_at = NOW()
  WHERE id = p_user_id;

  UPDATE public.shortlinks
  SET total_views = COALESCE(total_views, 0) + 1,
      updated_at = NOW()
  WHERE id = p_shortlink_id;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis, balance_before, balance_after,
    description, metadata, completed_at
  ) VALUES (
    p_user_id, 'shortlink', 'completed', v_shortlink.reward_satoshis,
    v_before, v_after, 'Shortlink completion',
    jsonb_build_object('shortlink_id', p_shortlink_id, 'view_id', v_view_id), NOW()
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'view_id', v_view_id,
    'transaction_id', v_tx_id,
    'reward', v_shortlink.reward_satoshis,
    'new_balance', v_after,
    'views_today', v_today_count + 1
  );
END;
$$;

-- Atomic PTC completion. The caller verifies the signed token, while this
-- function enforces ad state, budget, one-view-per-day, and ledger writes.
CREATE OR REPLACE FUNCTION public.complete_ptc_view(
  p_user_id UUID,
  p_ad_id UUID,
  p_started_at TIMESTAMPTZ,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id BIGINT;
  v_ad public.ptc_ads%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_before BIGINT;
  v_after BIGINT;
  v_view_id UUID;
  v_tx_id UUID;
  v_elapsed INTEGER;
  v_ip INET;
BEGIN
  v_lock_id := ('x' || substr(md5(p_user_id::text), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_id);

  SELECT * INTO v_ad
  FROM public.ptc_ads
  WHERE id = p_ad_id
    AND is_active = TRUE
    AND is_approved = TRUE
    AND remaining_budget_satoshis > 0
    AND start_date <= NOW()
    AND (end_date IS NULL OR end_date > NOW())
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'PTC_UNAVAILABLE', 'message', 'PTC ad is unavailable or out of budget');
  END IF;

  v_elapsed := EXTRACT(EPOCH FROM (NOW() - p_started_at))::INTEGER;
  IF v_elapsed < v_ad.duration_seconds THEN
    RETURN jsonb_build_object('success', false, 'error', 'WATCH_TOO_SHORT', 'message', 'Required viewing time has not elapsed', 'elapsed', v_elapsed, 'required', v_ad.duration_seconds);
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', 'Profile not found');
  END IF;

  BEGIN
    v_ip := CASE
      WHEN p_ip_address IS NULL OR p_ip_address = '' OR p_ip_address = 'unknown' THEN NULL
      WHEN p_ip_address ~ '^[0-9a-fA-F:.]+$' THEN p_ip_address::INET
      ELSE NULL
    END;

    INSERT INTO public.ptc_views (
      user_id, ad_id, reward_satoshis, view_duration_seconds, completed,
      ip_address, user_agent, completed_at
    ) VALUES (
      p_user_id, p_ad_id, v_ad.reward_satoshis, v_elapsed, TRUE,
      v_ip, p_user_agent, NOW()
    ) RETURNING id INTO v_view_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_COMPLETED', 'message', 'You already watched this ad today');
  END;

  v_before := COALESCE(v_profile.balance_satoshis, 0);
  v_after := v_before + v_ad.reward_satoshis;

  UPDATE public.profiles
  SET balance_satoshis = v_after,
      total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + v_ad.reward_satoshis,
      updated_at = NOW()
  WHERE id = p_user_id;

  UPDATE public.ptc_ads
  SET remaining_budget_satoshis = remaining_budget_satoshis - v_ad.reward_satoshis,
      total_views = COALESCE(total_views, 0) + 1,
      total_unique_views = COALESCE(total_unique_views, 0) + 1,
      updated_at = NOW()
  WHERE id = p_ad_id;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis, balance_before, balance_after,
    description, metadata, completed_at
  ) VALUES (
    p_user_id, 'ptc', 'completed', v_ad.reward_satoshis,
    v_before, v_after, 'PTC advertisement completion',
    jsonb_build_object('ad_id', p_ad_id, 'view_id', v_view_id, 'duration_seconds', v_elapsed), NOW()
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'view_id', v_view_id,
    'transaction_id', v_tx_id,
    'reward', v_ad.reward_satoshis,
    'new_balance', v_after
  );
END;
$$;

-- Atomic game finalization. Validation of score/challenge happens in the API;
-- this function owns the single-writer session, daily limit, cooldown, balance,
-- and transaction transition.
CREATE OR REPLACE FUNCTION public.complete_game_reward(
  p_user_id UUID,
  p_session_id UUID,
  p_score INTEGER,
  p_game_type TEXT,
  p_is_winner BOOLEAN,
  p_reward_satoshis INTEGER,
  p_game_duration_ms INTEGER,
  p_cooldown_until TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.game_sessions%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_daily public.game_daily_limits%ROWTYPE;
  v_before BIGINT;
  v_after BIGINT;
  v_games_today INTEGER;
  v_total_earned INTEGER;
  v_tx_id UUID;
BEGIN
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id AND user_id = p_user_id AND session_token IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'in_progress' OR v_session.game_type <> p_game_type THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_SESSION', 'message', 'Invalid or already completed game session');
  END IF;

  SELECT * INTO v_daily
  FROM public.game_daily_limits
  WHERE user_id = p_user_id
    AND date = (NOW() AT TIME ZONE 'UTC')::DATE
  FOR UPDATE;

  v_games_today := COALESCE(v_daily.games_played, 0);
  v_total_earned := COALESCE(v_daily.total_earned, 0);
  IF v_games_today >= 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'DAILY_LIMIT', 'message', 'Daily game limit reached');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', 'Profile not found');
  END IF;

  UPDATE public.game_sessions
  SET score = p_score,
      status = CASE WHEN p_is_winner THEN 'completed' ELSE 'lost' END,
      reward_satoshis = CASE WHEN p_is_winner THEN p_reward_satoshis ELSE 0 END,
      game_duration_ms = p_game_duration_ms,
      completed_at = NOW()
  WHERE id = p_session_id;

  v_games_today := v_games_today + 1;
  IF p_is_winner THEN v_total_earned := v_total_earned + p_reward_satoshis; END IF;

  INSERT INTO public.game_daily_limits (user_id, date, games_played, total_earned, last_game_at, updated_at)
  VALUES (p_user_id, (NOW() AT TIME ZONE 'UTC')::DATE, v_games_today, v_total_earned, NOW(), NOW())
  ON CONFLICT (user_id, date) DO UPDATE SET
    games_played = EXCLUDED.games_played,
    total_earned = EXCLUDED.total_earned,
    last_game_at = EXCLUDED.last_game_at,
    updated_at = NOW();

  IF p_is_winner THEN
    INSERT INTO public.game_cooldowns (user_id, game_type, cooldown_until, updated_at)
    VALUES (p_user_id, p_game_type, COALESCE(p_cooldown_until, NOW() + INTERVAL '3 minutes'), NOW())
    ON CONFLICT (user_id, game_type) DO UPDATE SET
      cooldown_until = EXCLUDED.cooldown_until,
      updated_at = NOW();

    v_before := COALESCE(v_profile.balance_satoshis, 0);
    v_after := v_before + p_reward_satoshis;

    UPDATE public.profiles
    SET balance_satoshis = v_after,
        total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + p_reward_satoshis,
        updated_at = NOW()
    WHERE id = p_user_id;

    INSERT INTO public.transactions (
      user_id, type, status, amount_satoshis, balance_before, balance_after,
      description, metadata, completed_at
    ) VALUES (
      p_user_id, 'game', 'completed', p_reward_satoshis, v_before, v_after,
      'Game reward', jsonb_build_object('game_id', p_session_id, 'game_type', p_game_type, 'score', p_score), NOW()
    ) RETURNING id INTO v_tx_id;
  ELSE
    v_after := COALESCE(v_profile.balance_satoshis, 0);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_winner', p_is_winner,
    'reward', CASE WHEN p_is_winner THEN p_reward_satoshis ELSE 0 END,
    'new_balance', v_after,
    'games_played_today', v_games_today,
    'total_earned_today', v_total_earned,
    'transaction_id', v_tx_id,
    'cooldown_until', CASE WHEN p_is_winner THEN COALESCE(p_cooldown_until, NOW() + INTERVAL '3 minutes') ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_shortlink_view(UUID, UUID, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_ptc_view(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_game_reward(UUID, UUID, INTEGER, TEXT, BOOLEAN, INTEGER, INTEGER, TIMESTAMPTZ) TO service_role;

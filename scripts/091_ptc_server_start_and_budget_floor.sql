-- 091: PTC server-start transition, schema compatibility, and budget floor.
-- Migration 090 removed direct client writes from reward tables. This migration
-- closes the remaining PTC timing/accounting gaps without changing applied 084.

ALTER TABLE public.ptc_ads
  ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

ALTER TABLE public.ptc_views
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS view_duration_seconds INTEGER;

ALTER TABLE public.shortlink_views
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS view_duration_ms INTEGER;

DROP POLICY IF EXISTS ptc_views_insert ON public.ptc_views;
DROP POLICY IF EXISTS ptc_views_insert_own ON public.ptc_views;
DROP POLICY IF EXISTS ptc_views_update ON public.ptc_views;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ptc_views_user_ad_utc_day
  ON public.ptc_views (
    user_id,
    ad_id,
    date_trunc('day', created_at AT TIME ZONE 'UTC')
  );

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
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  v_lock_id := ('x' || substr(md5(p_user_id::text), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_id);

  SELECT * INTO v_ad
  FROM public.ptc_ads
  WHERE id = p_ad_id
    AND is_active = TRUE
    AND is_approved = TRUE
    AND reward_satoshis > 0
    AND remaining_budget_satoshis >= reward_satoshis
    AND start_date <= NOW()
    AND (end_date IS NULL OR end_date > NOW())
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'PTC_UNAVAILABLE', 'message', 'PTC ad is unavailable or out of budget');
  END IF;

  IF p_started_at IS NULL OR p_started_at > NOW() + INTERVAL '30 seconds' OR p_started_at < NOW() - INTERVAL '24 hours' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_WATCH_SESSION', 'message', 'Invalid PTC watch session');
  END IF;

  v_elapsed := EXTRACT(EPOCH FROM (NOW() - p_started_at))::INTEGER;
  IF v_elapsed < v_ad.duration_seconds THEN
    RETURN jsonb_build_object('success', false, 'error', 'WATCH_TOO_SHORT', 'message', 'Required viewing time has not elapsed', 'elapsed', v_elapsed, 'required', v_ad.duration_seconds);
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_profile.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_RESTRICTED', 'message', 'Account is not active');
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
  WHERE id = p_ad_id
    AND remaining_budget_satoshis >= v_ad.reward_satoshis;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PTC budget changed during fulfillment' USING ERRCODE = '40001';
  END IF;

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

REVOKE ALL ON FUNCTION public.complete_ptc_view(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ptc_view(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO service_role;

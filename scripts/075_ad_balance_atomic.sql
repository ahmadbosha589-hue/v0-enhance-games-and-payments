-- Atomic advertiser campaign creation and initial budget reservation.
-- Apply after scripts/072_advertise_fixes.sql and before delivery RPCs.

CREATE OR REPLACE FUNCTION public.create_ad_campaign(
  p_user_id UUID,
  p_name TEXT,
  p_network TEXT,
  p_network_name TEXT,
  p_budget NUMERIC,
  p_daily_budget NUMERIC,
  p_target_url TEXT,
  p_title TEXT,
  p_description TEXT,
  p_image_url TEXT,
  p_target_countries TEXT[],
  p_targeting JSONB,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_cpm NUMERIC
)
RETURNS TABLE (campaign_id UUID, new_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_before NUMERIC(12,4);
  v_after NUMERIC(12,4);
  v_campaign_id UUID;
BEGIN
  IF p_budget <= 0 OR p_daily_budget <= 0 OR p_daily_budget > p_budget THEN
    RAISE EXCEPTION 'invalid campaign budget';
  END IF;

  SELECT * INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advertiser profile not found';
  END IF;

  v_before := COALESCE(v_profile.ad_balance_usd, 0)::NUMERIC(12,4);
  IF v_before < p_budget THEN
    RAISE EXCEPTION 'insufficient advertising balance';
  END IF;

  v_after := v_before - p_budget;

  INSERT INTO public.ad_campaigns (
    user_id, name, network, network_name, budget, daily_budget,
    spent, target_url, title, description, image_url, creative_url,
    target_countries, targeting, channel, start_date, end_date,
    status, creative_status, impressions, clicks, conversions, cpm,
    spent_today, is_managed
  ) VALUES (
    p_user_id, p_name, p_network, p_network_name, p_budget, p_daily_budget,
    0, p_target_url, p_title, p_description, p_image_url, p_image_url,
    COALESCE(p_target_countries, ARRAY[]::TEXT[]),
    COALESCE(p_targeting, '{}'::JSONB), p_network, COALESCE(p_start_date, NOW()), p_end_date,
    'pending', 'pending', 0, 0, 0, p_cpm,
    0, FALSE
  )
  RETURNING id INTO v_campaign_id;

  UPDATE public.profiles
     SET ad_balance_usd = v_after, updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.ad_transactions (
    user_id, campaign_id, type, amount, balance_before,
    balance_after, description
  ) VALUES (
    p_user_id, v_campaign_id, 'campaign_created', -p_budget,
    v_before, v_after, 'Campaign created: ' || p_name
  );

  RETURN QUERY SELECT v_campaign_id, v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ad_campaign(
  UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT,
  TEXT[], JSONB, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC
) FROM PUBLIC, anon, authenticated;

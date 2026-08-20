-- Corrective RPC migration for live delivery-schema compatibility.
-- 074 used a conflict target named campaign_id inside a RETURNS TABLE
-- function whose output variable has the same name. PostgreSQL resolves that
-- as an ambiguous PL/pgSQL reference. The delivery tables have one relevant
-- dedupe unique index, so an unqualified ON CONFLICT DO NOTHING is sufficient.

CREATE OR REPLACE FUNCTION public.serve_ad(
  p_slot TEXT,
  p_channel TEXT,
  p_country TEXT,
  p_device TEXT,
  p_viewer_hash TEXT
)
RETURNS TABLE (
  campaign_id UUID,
  title TEXT,
  description TEXT,
  creative_url TEXT,
  target_url TEXT,
  impression_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.ad_campaigns;
  v_cost NUMERIC(12,6);
  v_impression_id BIGINT;
  v_today DATE := CURRENT_DATE;
  v_bucket TIMESTAMPTZ := date_trunc('minute', NOW());
BEGIN
  SELECT c.*
    INTO v_campaign
    FROM public.ad_campaigns c
   WHERE c.status = 'active'
     AND c.creative_status = 'approved'
     AND (c.start_date IS NULL OR c.start_date <= NOW())
     AND (c.end_date IS NULL OR c.end_date > NOW())
     AND COALESCE(c.channel, c.network) = p_channel
     AND c.spent < c.budget
     AND (
       c.spent_today_date IS DISTINCT FROM v_today
       OR c.spent_today < c.daily_budget
     )
     AND (
       p_country IS NULL
       OR COALESCE(c.targeting->'countries', '[]'::jsonb) = '[]'::jsonb
       OR (c.targeting->'countries') ? p_country
     )
     AND (
       p_device IS NULL
       OR COALESCE(c.targeting->'devices', '[]'::jsonb) = '[]'::jsonb
       OR (c.targeting->'devices') ? p_device
     )
   ORDER BY (c.budget - c.spent) * random() DESC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN; END IF;

  v_cost := ROUND(GREATEST(COALESCE(v_campaign.cpm, 0), 0)::NUMERIC / 1000.0, 6);

  INSERT INTO public.ad_delivery_impressions (
    campaign_id, slot, position, viewer_hash, country, device,
    cost, dedupe_bucket
  ) VALUES (
    v_campaign.id, p_slot, p_slot, p_viewer_hash, p_country, p_device,
    v_cost, v_bucket
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_impression_id;

  IF v_impression_id IS NULL THEN
    RETURN QUERY SELECT v_campaign.id, v_campaign.title, v_campaign.description,
      v_campaign.creative_url, v_campaign.target_url, NULL::BIGINT;
    RETURN;
  END IF;

  UPDATE public.ad_campaigns
     SET impressions = impressions + 1,
         spent = spent + v_cost,
         spent_today = CASE
           WHEN spent_today_date = v_today THEN spent_today + v_cost
           ELSE v_cost
         END,
         spent_today_date = v_today,
         status = CASE
           WHEN spent + v_cost >= budget THEN 'completed'
           ELSE status
         END,
         updated_at = NOW()
   WHERE id = v_campaign.id;

  INSERT INTO public.ad_campaign_daily (campaign_id, day, impressions, spend)
  VALUES (v_campaign.id, v_today, 1, v_cost)
  ON CONFLICT (campaign_id, day) DO UPDATE
    SET impressions = public.ad_campaign_daily.impressions + 1,
        spend = public.ad_campaign_daily.spend + v_cost;

  RETURN QUERY SELECT v_campaign.id, v_campaign.title, v_campaign.description,
    v_campaign.creative_url, v_campaign.target_url, v_impression_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ad_click(
  p_impression_id BIGINT,
  p_viewer_hash TEXT,
  p_country TEXT DEFAULT NULL,
  p_device TEXT DEFAULT NULL
)
RETURNS TABLE (target_url TEXT, is_valid BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id UUID;
  v_target_url TEXT;
  v_bucket TIMESTAMPTZ := date_trunc('hour', NOW());
  v_inserted BIGINT;
BEGIN
  SELECT i.campaign_id, c.target_url
    INTO v_campaign_id, v_target_url
    FROM public.ad_delivery_impressions i
    JOIN public.ad_campaigns c ON c.id = i.campaign_id
   WHERE i.id = p_impression_id;

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.ad_delivery_clicks (
    campaign_id, impression_id, viewer_hash, country, device,
    is_valid, dedupe_bucket
  ) VALUES (
    v_campaign_id, p_impression_id, p_viewer_hash, p_country, p_device,
    TRUE, v_bucket
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN QUERY SELECT v_target_url, FALSE;
    RETURN;
  END IF;

  UPDATE public.ad_campaigns
     SET clicks = clicks + 1, updated_at = NOW()
   WHERE id = v_campaign_id;

  INSERT INTO public.ad_campaign_daily (campaign_id, day, clicks)
  VALUES (v_campaign_id, CURRENT_DATE, 1)
  ON CONFLICT (campaign_id, day) DO UPDATE
    SET clicks = public.ad_campaign_daily.clicks + 1;

  RETURN QUERY SELECT v_target_url, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.serve_ad(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_ad_click(BIGINT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- Corrective RPC migration for the daily rollup conflict target.
-- `serve_ad` returns a campaign_id column, which becomes a PL/pgSQL output
-- variable. Use the named primary-key constraint to avoid ambiguity while
-- retaining an atomic upsert.

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
  ON CONFLICT ON CONSTRAINT ad_campaign_daily_pkey DO UPDATE
    SET impressions = public.ad_campaign_daily.impressions + 1,
        spend = public.ad_campaign_daily.spend + v_cost;

  RETURN QUERY SELECT v_campaign.id, v_campaign.title, v_campaign.description,
    v_campaign.creative_url, v_campaign.target_url, v_impression_id;
END;
$$;

REVOKE ALL ON FUNCTION public.serve_ad(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

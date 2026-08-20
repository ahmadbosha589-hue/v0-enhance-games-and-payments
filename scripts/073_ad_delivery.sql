-- First-party advertiser delivery tables.
-- Apply after scripts/072_advertise_fixes.sql.

ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.ad_delivery_impressions (
  id BIGSERIAL PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  position TEXT,
  viewer_hash TEXT NOT NULL,
  country TEXT,
  device TEXT,
  cost NUMERIC(12,6) NOT NULL DEFAULT 0,
  viewable BOOLEAN NOT NULL DEFAULT FALSE,
  dedupe_bucket TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_delivery_impressions_dedupe
  ON public.ad_delivery_impressions(campaign_id, viewer_hash, slot, dedupe_bucket);
CREATE INDEX IF NOT EXISTS idx_ad_delivery_impressions_campaign_time
  ON public.ad_delivery_impressions(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ad_delivery_clicks (
  id BIGSERIAL PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  impression_id BIGINT REFERENCES public.ad_delivery_impressions(id) ON DELETE SET NULL,
  viewer_hash TEXT NOT NULL,
  country TEXT,
  device TEXT,
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  reason TEXT,
  dedupe_bucket TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_delivery_clicks_dedupe
  ON public.ad_delivery_clicks(campaign_id, viewer_hash, dedupe_bucket);
CREATE INDEX IF NOT EXISTS idx_ad_delivery_clicks_campaign_time
  ON public.ad_delivery_clicks(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ad_campaign_daily (
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  viewable INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  spend NUMERIC(12,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, day)
);

ALTER TABLE public.ad_delivery_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_delivery_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaign_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own campaign daily" ON public.ad_campaign_daily;
CREATE POLICY "own campaign daily" ON public.ad_campaign_daily FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.ad_campaigns c
    WHERE c.id = campaign_id AND c.user_id = auth.uid()
  ));

REVOKE ALL ON TABLE public.ad_delivery_impressions, public.ad_delivery_clicks, public.ad_campaign_daily
  FROM PUBLIC, anon, authenticated;

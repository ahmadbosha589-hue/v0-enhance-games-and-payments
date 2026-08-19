-- Advertiser contract and delivery prerequisites
-- Apply after scripts/advertise-tables.sql.

ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS conversions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS targeting JSONB NOT NULL DEFAULT '{"countries": [], "devices": ["desktop", "mobile", "tablet"], "os": [], "languages": []}'::jsonb,
  ADD COLUMN IF NOT EXISTS channel TEXT,
  ADD COLUMN IF NOT EXISTS creative_url TEXT,
  ADD COLUMN IF NOT EXISTS creative_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS spent_today NUMERIC(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spent_today_date DATE,
  ADD COLUMN IF NOT EXISTS is_managed BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.ad_campaigns
SET targeting = jsonb_build_object(
  'countries', COALESCE(target_countries, ARRAY[]::TEXT[]),
  'devices', ARRAY['desktop', 'mobile', 'tablet'],
  'os', ARRAY[]::TEXT[],
  'languages', ARRAY[]::TEXT[]
)
WHERE targeting = '{}'::jsonb OR targeting IS NULL;

UPDATE public.ad_campaigns
SET channel = network,
    creative_url = image_url
WHERE channel IS NULL OR creative_url IS NULL;

ALTER TABLE public.ad_campaigns
  DROP CONSTRAINT IF EXISTS ad_campaigns_creative_status_check;

ALTER TABLE public.ad_campaigns
  ADD CONSTRAINT ad_campaigns_creative_status_check
  CHECK (creative_status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_delivery
  ON public.ad_campaigns(status, creative_status, channel, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_targeting
  ON public.ad_campaigns USING GIN(targeting);

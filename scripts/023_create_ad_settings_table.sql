-- Create ad_settings table for managing ad network configurations
CREATE TABLE IF NOT EXISTS ad_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position VARCHAR(50) NOT NULL UNIQUE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('aads', 'coinzilla', 'bitsmedia')),
  enabled BOOLEAN DEFAULT true,
  -- A-ADS settings
  aads_id VARCHAR(100),
  -- Coinzilla settings
  coinzilla_zone VARCHAR(100),
  -- Bitsmedia settings
  bitsmedia_id VARCHAR(100),
  bitsmedia_slot VARCHAR(100),
  -- Metadata
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  revenue_satoshis BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ad_settings_position ON ad_settings(position);
CREATE INDEX IF NOT EXISTS idx_ad_settings_enabled ON ad_settings(enabled);

-- Insert default ad positions
INSERT INTO ad_settings (position, provider, enabled) VALUES
  ('sidebar', 'aads', false),
  ('header', 'coinzilla', false),
  ('content', 'aads', false),
  ('footer', 'bitsmedia', false),
  ('between-content', 'coinzilla', false)
ON CONFLICT (position) DO NOTHING;

-- Create ad_impressions table for tracking
CREATE TABLE IF NOT EXISTS ad_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_setting_id UUID REFERENCES ad_settings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ip_hash VARCHAR(64),
  user_agent TEXT,
  page_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad_setting ON ad_impressions(ad_setting_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_created ON ad_impressions(created_at);

-- Enable RLS
ALTER TABLE ad_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;

-- Policies for ad_settings (public read, admin write)
CREATE POLICY "Anyone can view enabled ad settings"
  ON ad_settings FOR SELECT
  USING (enabled = true);

CREATE POLICY "Admins can manage ad settings"
  ON ad_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Policies for ad_impressions
CREATE POLICY "Admins can view ad impressions"
  ON ad_impressions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Anyone can create ad impressions"
  ON ad_impressions FOR INSERT
  WITH CHECK (true);

-- Function to update ad stats
CREATE OR REPLACE FUNCTION increment_ad_stats(
  p_position VARCHAR(50),
  p_type VARCHAR(20) -- 'impression' or 'click'
)
RETURNS void AS $$
BEGIN
  IF p_type = 'impression' THEN
    UPDATE ad_settings
    SET impressions = impressions + 1,
        updated_at = NOW()
    WHERE position = p_position;
  ELSIF p_type = 'click' THEN
    UPDATE ad_settings
    SET clicks = clicks + 1,
        updated_at = NOW()
    WHERE position = p_position;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

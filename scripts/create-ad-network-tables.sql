-- Ad Network Configuration Table
-- Stores encrypted credentials for various ad networks

CREATE TABLE IF NOT EXISTS ad_network_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  network_id TEXT NOT NULL UNIQUE,
  encrypted_config TEXT NOT NULL,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE ad_network_configs ENABLE ROW LEVEL SECURITY;

-- Only admins can access
CREATE POLICY "Admins can manage ad network configs" ON ad_network_configs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ad_network_configs_network_id ON ad_network_configs(network_id);
CREATE INDEX IF NOT EXISTS idx_ad_network_configs_enabled ON ad_network_configs(enabled);

-- Support earnings tracking table (for Support Us feature)
CREATE TABLE IF NOT EXISTS support_earnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ads_watched INTEGER DEFAULT 0,
  earnings_satoshis BIGINT DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Enable RLS
ALTER TABLE support_earnings ENABLE ROW LEVEL SECURITY;

-- Users can only see their own support earnings
CREATE POLICY "Users can view own support earnings" ON support_earnings
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert/update their own support earnings
CREATE POLICY "Users can update own support earnings" ON support_earnings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can modify own support earnings" ON support_earnings
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_support_earnings_user_id ON support_earnings(user_id);
CREATE INDEX IF NOT EXISTS idx_support_earnings_date ON support_earnings(date);

-- Function to get tournament standings for supporter tournaments
CREATE OR REPLACE FUNCTION get_supporter_tournament_standings(
  p_period TEXT,
  p_type TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  score BIGINT,
  rank BIGINT
) AS $$
DECLARE
  start_date DATE;
BEGIN
  -- Calculate start date based on period
  IF p_period = 'daily' THEN
    start_date := CURRENT_DATE;
  ELSIF p_period = 'weekly' THEN
    start_date := date_trunc('week', CURRENT_DATE)::DATE;
  ELSE
    start_date := date_trunc('month', CURRENT_DATE)::DATE;
  END IF;

  RETURN QUERY
  SELECT
    se.user_id,
    p.display_name as username,
    p.avatar_url,
    CASE
      WHEN p_type = 'supporter_ads_watched' THEN SUM(se.ads_watched)::BIGINT
      ELSE SUM(se.earnings_satoshis)::BIGINT
    END as score,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE
          WHEN p_type = 'supporter_ads_watched' THEN SUM(se.ads_watched)
          ELSE SUM(se.earnings_satoshis)
        END DESC
    ) as rank
  FROM support_earnings se
  JOIN profiles p ON p.id = se.user_id
  WHERE se.date >= start_date
  GROUP BY se.user_id, p.display_name, p.avatar_url
  ORDER BY score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

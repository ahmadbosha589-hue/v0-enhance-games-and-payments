-- =============================================================================
-- ADBLOCK DETECTION ANALYTICS TABLE
-- Tracks visits and adblock detections for accurate rate calculation
-- =============================================================================

-- Create the adblock_analytics table
CREATE TABLE IF NOT EXISTS adblock_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Detection data
  adblock_detected BOOLEAN NOT NULL DEFAULT false,
  confidence NUMERIC(5,2),
  server_score NUMERIC(5,2),
  blocker_type TEXT,
  
  -- Metadata
  ip_address TEXT,
  user_agent TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint to prevent double counting (one record per user per session per day)
  CONSTRAINT unique_user_session_date UNIQUE (user_id, session_id, date)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_adblock_analytics_date ON adblock_analytics(date);
CREATE INDEX IF NOT EXISTS idx_adblock_analytics_detected ON adblock_analytics(adblock_detected);
CREATE INDEX IF NOT EXISTS idx_adblock_analytics_user_id ON adblock_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_adblock_analytics_created_at ON adblock_analytics(created_at);

-- Enable RLS
ALTER TABLE adblock_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only admins can read, system can insert
CREATE POLICY "Admins can read adblock_analytics"
  ON adblock_analytics
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Allow authenticated users to insert their own analytics (for tracking)
CREATE POLICY "Users can insert own adblock_analytics"
  ON adblock_analytics
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Create a function to get adblock detection rate stats
CREATE OR REPLACE FUNCTION get_adblock_stats(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_visits BIGINT,
  adblock_detections BIGINT,
  detection_rate NUMERIC(5,2),
  unique_users_with_adblock BIGINT,
  avg_confidence NUMERIC(5,2),
  avg_server_score NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_visits,
    COUNT(*) FILTER (WHERE aa.adblock_detected = true)::BIGINT AS adblock_detections,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE aa.adblock_detected = true)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0
    END AS detection_rate,
    COUNT(DISTINCT aa.user_id) FILTER (WHERE aa.adblock_detected = true)::BIGINT AS unique_users_with_adblock,
    ROUND(AVG(aa.confidence) FILTER (WHERE aa.adblock_detected = true), 2) AS avg_confidence,
    ROUND(AVG(aa.server_score) FILTER (WHERE aa.adblock_detected = true), 2) AS avg_server_score
  FROM adblock_analytics aa
  WHERE aa.created_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$;

-- Create a function to get daily adblock stats for charting
CREATE OR REPLACE FUNCTION get_daily_adblock_stats(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  total_visits BIGINT,
  adblock_detections BIGINT,
  detection_rate NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    aa.date,
    COUNT(*)::BIGINT AS total_visits,
    COUNT(*) FILTER (WHERE aa.adblock_detected = true)::BIGINT AS adblock_detections,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE aa.adblock_detected = true)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0
    END AS detection_rate
  FROM adblock_analytics aa
  WHERE aa.date >= CURRENT_DATE - p_days
  GROUP BY aa.date
  ORDER BY aa.date ASC;
END;
$$;

-- Grant execute permissions to authenticated users (functions have SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION get_adblock_stats(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_adblock_stats(INTEGER) TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE adblock_analytics IS 'Tracks visits and adblock detection events for analytics. Uses unique constraint on (user_id, session_id, date) to prevent double counting.';

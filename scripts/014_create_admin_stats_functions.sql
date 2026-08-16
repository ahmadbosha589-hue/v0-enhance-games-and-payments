-- Function to get daily stats for charts (last 7 days)
CREATE OR REPLACE FUNCTION get_daily_stats(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
  date DATE,
  claims_count BIGINT,
  active_users BIGINT,
  new_users BIGINT,
  satoshis_distributed BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (days_back - 1),
      CURRENT_DATE,
      '1 day'::INTERVAL
    )::DATE AS date
  ),
  daily_claims AS (
    SELECT 
      DATE(created_at) AS claim_date,
      COUNT(*) AS claim_count,
      COUNT(DISTINCT user_id) AS unique_users,
      COALESCE(SUM(amount_satoshis), 0) AS total_sats
    FROM claims
    WHERE created_at >= CURRENT_DATE - days_back
    GROUP BY DATE(created_at)
  ),
  daily_signups AS (
    SELECT 
      DATE(created_at) AS signup_date,
      COUNT(*) AS signup_count
    FROM profiles
    WHERE created_at >= CURRENT_DATE - days_back
    GROUP BY DATE(created_at)
  )
  SELECT 
    ds.date,
    COALESCE(dc.claim_count, 0)::BIGINT AS claims_count,
    COALESCE(dc.unique_users, 0)::BIGINT AS active_users,
    COALESCE(du.signup_count, 0)::BIGINT AS new_users,
    COALESCE(dc.total_sats, 0)::BIGINT AS satoshis_distributed
  FROM date_series ds
  LEFT JOIN daily_claims dc ON ds.date = dc.claim_date
  LEFT JOIN daily_signups du ON ds.date = du.signup_date
  ORDER BY ds.date ASC;
END;
$$;

-- Grant to service role only (admin function)
GRANT EXECUTE ON FUNCTION get_daily_stats(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION get_daily_stats(INTEGER) TO authenticated;

-- Create a function to get platform stats for the landing page and admin
CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  total_distributed BIGINT;
  total_users_count BIGINT;
  total_claims_count BIGINT;
  today_claims_count BIGINT;
BEGIN
  -- Get total distributed (sum of all earnings)
  SELECT COALESCE(SUM(total_earned_satoshis), 0) INTO total_distributed FROM profiles;
  
  -- Get total users
  SELECT COUNT(*) INTO total_users_count FROM profiles;
  
  -- Get total claims
  SELECT COUNT(*) INTO total_claims_count FROM claims;
  
  -- Get today's claims
  SELECT COUNT(*) INTO today_claims_count 
  FROM claims 
  WHERE created_at >= CURRENT_DATE;
  
  result := json_build_object(
    'total_distributed_satoshis', total_distributed,
    'total_distributed_btc', (total_distributed::DECIMAL / 100000000),
    'total_users', total_users_count,
    'total_claims', total_claims_count,
    'today_claims', today_claims_count
  );
  
  RETURN result;
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION get_platform_stats() TO anon;
GRANT EXECUTE ON FUNCTION get_platform_stats() TO authenticated;

-- 093: Keep browser statistics on server-owned routes.
-- `get_platform_stats`, `get_leaderboard`, and daily aggregate helpers were
-- SECURITY DEFINER and still publicly executable. Current browser consumers use
-- API routes or ordinary table reads instead; keep the adblock aggregate helper
-- available to the existing admin analytics route.

DO $$
DECLARE
  v_fn RECORD;
  v_names TEXT[] := ARRAY[
    'get_platform_stats',
    'get_leaderboard',
    'get_daily_stats',
    'get_daily_adblock_stats'
  ];
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(v_names)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn.signature);
  END LOOP;
END;
$$;

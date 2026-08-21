-- 092: Revoke legacy SECURITY DEFINER reward/balance routines from client roles.
-- Live introspection found these routines still executable by PUBLIC, anon, and
-- authenticated. The active server routes use the service-role client for the
-- operations retained here. Read-only public/statistics helpers and the
-- is_admin/is_superadmin policy helpers are intentionally not included.

DO $$
DECLARE
  v_fn RECORD;
  v_names TEXT[] := ARRAY[
    'admin_activate_booster',
    'atomic_withdraw',
    'calculate_claim_amount',
    'calculate_user_balance_from_transactions',
    'can_play_game',
    'can_play_game_type',
    'can_user_claim',
    'cleanup_old_security_data',
    'complete_game_session',
    'finalize_tournament',
    'get_authoritative_balance',
    'get_claim_amount',
    'get_or_create_tournament',
    'get_user_stats',
    'handle_new_user',
    'increment_ad_stats',
    'increment_fraud_score',
    'process_offerwall_conversion',
    'process_withdrawal',
    'reset_daily_support_stats',
    'reverse_offerwall_conversion',
    'set_game_cooldown',
    'start_game_session',
    'update_tournament_score',
    'validate_user_balance_integrity',
    'verify_and_repair_all_balances'
  ];
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(v_names)
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_fn.signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      v_fn.signature
    );
  END LOOP;
END;
$$;

-- Defaults from both known application owners must not grant future routines
-- to browser roles. A managed Supabase owner may reject the second block; that
-- is non-fatal because the current migration role is still protected by the
-- first block and 090 already revoked current object privileges.
DO $$
BEGIN
  BEGIN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
      ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM anon, authenticated;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not alter postgres default privileges with this migration role';
  END;

  BEGIN
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
      REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
      ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
      REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
      REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM anon, authenticated;
  EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
    RAISE NOTICE 'Could not alter supabase_admin default privileges with this migration role';
  END;
END;
$$;

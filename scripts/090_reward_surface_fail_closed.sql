-- 090: Fail-closed reward surface.
--
-- Live introspection of the configured database proved that `anon` and
-- `authenticated` held direct INSERT/UPDATE/DELETE/TRUNCATE on every
-- reward-bearing table, including `profiles` (all 92 columns), `transactions`,
-- `claims`, `ptc_views`, `shortlink_views`, `game_sessions`, `user_boosters`,
-- and `ptc_ads`, and that permissive RLS policies allowed a user to insert or
-- update their own rows. Combined, a logged-in client holding only the public
-- anon key could set its own `balance_satoshis`, forge `transactions` rows,
-- fabricate `ptc_views` (unlocking the direct faucet), and rewrite advertiser
-- budgets, entirely bypassing the atomic RPCs added in 084-089.
--
-- This migration removes every client write path on reward state. All reward
-- mutation must go through the SECURITY DEFINER RPCs, which run as the server
-- role behind an authenticated Next.js route. Reads are untouched.
--
-- Verify with: node scripts/verify-reward-acl.mjs

-- ---------------------------------------------------------------------------
-- 1. Revoke client write privileges on reward-bearing tables.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'profiles',
    'transactions',
    'claims',
    'ptc_views',
    'ptc_ads',
    'shortlink_views',
    'shortlinks',
    'game_sessions',
    'game_daily_limits',
    'game_cooldowns',
    'coupon_redemptions',
    'coupons',
    'user_achievements',
    'achievements',
    'manual_faucet_claims',
    'user_boosters',
    'withdrawals',
    'referrals',
    'offerwall_conversions',
    'fraud_flags',
    'audit_logs',
    'system_settings',
    'ad_campaigns',
    'ad_transactions'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM anon, authenticated',
        v_table
      );
    END IF;
  END LOOP;
END;
$$;

-- Users still need to maintain their own display identity and notification
-- read-state through the browser client, so re-grant only those columns.
DO $$
DECLARE
  v_column TEXT;
  v_columns TEXT[] := ARRAY[
    'display_name',
    'username',
    'avatar_url',
    'last_active_at',
    'last_login_ip',
    'signup_ip'
  ];
BEGIN
  FOREACH v_column IN ARRAY v_columns LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = v_column
    ) THEN
      EXECUTE format(
        'GRANT UPDATE (%I) ON TABLE public.profiles TO authenticated',
        v_column
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    GRANT UPDATE (is_read, read_at) ON TABLE public.notifications TO authenticated;
    GRANT DELETE ON TABLE public.notifications TO authenticated;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'device_fingerprints'
  ) THEN
    GRANT INSERT, UPDATE ON TABLE public.device_fingerprints TO authenticated;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Drop permissive client write policies on reward state.
--    The service_role policies remain, so server RPCs keep working.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_policy RECORD;
  v_keep TEXT[] := ARRAY[
    'profiles_service_all',
    'transactions_service_all',
    'claims_service_all',
    'ptc_views_service_all',
    'ptc_ads_service_all',
    'ptc_ads_admin',
    'shortlink_views_service_all',
    'game_sessions_service_all',
    'game_daily_limits_service_all',
    'game_cooldowns_service_all',
    'user_achievements_service_all',
    'user_boosters_service_all',
    'manual_faucet_service_all',
    'claims_admin_update',
    'profiles_admin_update',
    'Admin full access to redemptions'
  ];
BEGIN
  FOR v_policy IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND tablename IN (
        'profiles', 'transactions', 'claims', 'ptc_views', 'shortlink_views',
        'game_sessions', 'game_daily_limits', 'game_cooldowns',
        'coupon_redemptions', 'user_achievements', 'manual_faucet_claims',
        'user_boosters'
      )
      AND NOT (policyname = ANY(v_keep))
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      v_policy.policyname,
      v_policy.tablename
    );
  END LOOP;
END;
$$;

-- Profile self-service update policy, restricted to non-financial columns by
-- the column-level GRANT above.
DROP POLICY IF EXISTS profiles_update_own_identity ON public.profiles;
CREATE POLICY profiles_update_own_identity ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 3. Revoke EXECUTE on every remaining reward/balance routine from client roles.
--    Signatures were read from pg_get_function_identity_arguments on the live
--    database, so these match exactly.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn RECORD;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'add_game_reward',
        'atomic_claim',
        'process_referral_commission',
        'safe_add_balance',
        'modify_user_balance',
        'verify_and_repair_all_balances',
        'complete_shortlink_view',
        'complete_ptc_view',
        'complete_game_reward',
        'complete_daily_bonus',
        'redeem_coupon_atomic',
        'claim_achievement_atomic',
        'reserve_manual_faucet_claim',
        'finalize_manual_faucet_claim',
        'start_game_session',
        'complete_game_session',
        'set_game_cooldown',
        'can_play_game',
        'can_play_game_type',
        'increment_referral_count',
        'increment_fraud_score',
        'check_self_referral_patterns',
        'process_referral_with_fraud_check',
        'detect_referral_clusters',
        'get_or_create_tournament',
        'update_tournament_score',
        'finalize_tournament',
        'process_offerwall_conversion',
        'reverse_offerwall_conversion',
        'purchase_booster_atomic',
        'activate_booster',
        'apply_booster_to_claim',
        'record_wallet_booster_payment'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn.signature);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Stop future blanket grants from re-opening the surface.
--    Historical migrations ran `GRANT ALL ON ALL TABLES/FUNCTIONS IN SCHEMA
--    public TO anon, authenticated`, and the owner's default ACLs still hand
--    new objects to client roles. Reset the defaults so newly created tables
--    and functions are not client-writable.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

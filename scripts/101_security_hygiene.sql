-- 101: Security hygiene — launch hardening.
--
-- Fixes from the pre-launch audit:
--   (a) fabricated offerwall payout history seeded by migration 035;
--   (b) TRUNCATE + full DML granted to anon/authenticated on many tables the
--       client never writes directly (all privileged writes go through
--       service-role RPCs/routes);
--   (c) coupons/shortlinks RLS enabled with zero policies;
--   (d) double_reward_claims service-role policy was fine but client DML was
--       still granted — revoke it (RLS policies for user reads remain);
--   (e) ad_settings had a redundant qual-true public SELECT policy on top of
--       the legit "enabled = true" one — drop the redundant one and keep the
--       scoped policy;
--   (f) functions still PUBLIC/anon-executable that no client code calls.

-- ─────────────────────────────────────────────────────────────────────────────
-- (a) Zero fabricated provider payout history (real conversions untouched).
--     The ccxua row's 3 real conversions are preserved; only the seeded fake
--     totals on walls with ZERO recorded conversions are zeroed.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.offerwall_providers
   SET total_paid_satoshis = 0,
       total_conversions = 0,
       updated_at = NOW()
 WHERE total_conversions = 0
   AND total_paid_satoshis > 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- (b) Revoke client-side DML/TRUNCATE on tables with NO legitimate direct
--     client write. Client-verified direct writes that MUST survive:
--       ad_impressions (impression beacons), adblock_analytics (client logging),
--       newsletter_subscribers (public subscribe), notifications (read-receipts)
--     Everything else is written server-side via service role only.
--     SELECT/REFERENCES/TRIGGER grants are left as-is where RLS governs reads.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  LOOP
    CONTINUE WHEN t IN (
      'ad_impressions', 'adblock_analytics', 'newsletter_subscribers',
      'notifications', 'contact_messages', 'schema_migrations'
    );

    EXECUTE format('REVOKE TRUNCATE ON public.%I FROM anon, authenticated', t);
    -- Tables where the client has a legitimate read but no write:
    -- strip INSERT/UPDATE/DELETE unless explicitly allowlisted above.
    IF t NOT IN (
      'ad_impressions', 'adblock_analytics', 'newsletter_subscribers',
      'notifications'
    ) THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- schema_migrations: runner-owned; clients never write.
REVOKE ALL ON public.schema_migrations FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- (c) coupons / shortlinks: RLS was ENABLED with zero policies → client reads
--     returned empty. These tables hold no secrets (codes are redeemed via
--     server routes which validate before revealing). Public read is the intent;
--     redemption itself stays server-side.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public can view coupons" ON public.coupons;
CREATE POLICY "public can view coupons"
  ON public.coupons FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR is_active IS NULL);

DROP POLICY IF EXISTS "public can view shortlinks" ON public.shortlinks;
CREATE POLICY "public can view shortlinks"
  ON public.shortlinks FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- (d/e) double_reward_claims: keep the two scoped policies, drop nothing there,
--       but its client DML was already revoked by the loop above. For
--       ad_settings: drop the redundant blanket-public policy; keep the
--       "enabled = true" one so the client config reader still works.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ad_settings_public_select" ON public.ad_settings;

-- double_reward_claims keeps: user-scoped SELECT + service_role ALL (verified).
-- Revoke any stray client DML again explicitly for clarity:
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.double_reward_claims FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- (f) Functions still executable by anon/authenticated that no browser code
--     calls (client-side .rpc( allowlist verified: calculate_user_balance_
--     from_transactions, increment_fraud_score, increment_ip_claims,
--     safe_add_balance). Everything else: service_role only.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn RECORD;
  allowed CONSTANT TEXT[] := ARRAY[
    'calculate_user_balance_from_transactions',
    'increment_fraud_score'
  ];
BEGIN
  FOR fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    CONTINUE WHEN fn.proname = ANY (allowed);
    BEGIN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
        fn.proname, fn.args
      );
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', fn.proname, fn.args);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- function shape changed between migrations; skip rather than abort
    END;
  END LOOP;
END $$;

-- =============================================================================
-- FAUCERO - MASTER DATABASE FIX SCRIPT
-- Run this once on your Supabase SQL editor to fix all known issues.
-- Every statement is idempotent (safe to re-run multiple times).
-- =============================================================================

-- =============================================================================
-- SECTION 1: ENUM TYPES
-- Add any missing values to existing enums.
-- =============================================================================

-- transaction_type enum — add values added by code but missing from older DBs
DO $$ BEGIN ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'daily_bonus'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'streak_bonus';  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'signup_bonus';  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'achievement';   EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'offerwall';     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'ptc';           EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'game';          EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'referral';      EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'shortlink';     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'coupon';        EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'manual_faucet'; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =============================================================================
-- SECTION 2: PROFILES TABLE — missing columns
-- =============================================================================

DO $$ BEGIN
  -- FaucetPay integration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='faucetpay_email') THEN
    ALTER TABLE public.profiles ADD COLUMN faucetpay_email TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='faucetpay_verified') THEN
    ALTER TABLE public.profiles ADD COLUMN faucetpay_verified BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- Daily bonus tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='last_daily_bonus_at') THEN
    ALTER TABLE public.profiles ADD COLUMN last_daily_bonus_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='total_daily_bonuses') THEN
    ALTER TABLE public.profiles ADD COLUMN total_daily_bonuses INTEGER NOT NULL DEFAULT 0;
  END IF;

  -- Fraud / adblock fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='adblock_flagged') THEN
    ALTER TABLE public.profiles ADD COLUMN adblock_flagged BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='fraud_flags') THEN
    ALTER TABLE public.profiles ADD COLUMN fraud_flags JSONB DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='cooldown_until') THEN
    ALTER TABLE public.profiles ADD COLUMN cooldown_until TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_faucetpay_email     ON public.profiles(faucetpay_email) WHERE faucetpay_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_last_daily_bonus_at ON public.profiles(last_daily_bonus_at);
CREATE INDEX IF NOT EXISTS idx_profiles_adblock_flagged     ON public.profiles(adblock_flagged) WHERE adblock_flagged = TRUE;

-- =============================================================================
-- SECTION 3: GAME_SESSIONS TABLE — fix game_type CHECK and add missing columns
-- =============================================================================

-- Drop the old restrictive CHECK so new game types work
DO $$ BEGIN
  ALTER TABLE public.game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add missing columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='game_sessions' AND column_name='fingerprint_hash') THEN
    ALTER TABLE public.game_sessions ADD COLUMN fingerprint_hash TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='game_sessions' AND column_name='min_score_required') THEN
    ALTER TABLE public.game_sessions ADD COLUMN min_score_required INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='game_sessions' AND column_name='difficulty_level') THEN
    ALTER TABLE public.game_sessions ADD COLUMN difficulty_level INTEGER DEFAULT 1;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_game_sessions_fingerprint   ON public.game_sessions(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_game_sessions_ip_created    ON public.game_sessions(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status        ON public.game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_status   ON public.game_sessions(user_id, status);

-- Admin/service-role policy so API routes can manage sessions
DROP POLICY IF EXISTS "game_sessions_service_all" ON public.game_sessions;
CREATE POLICY "game_sessions_service_all" ON public.game_sessions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 4: GAME_COOLDOWNS TABLE
-- Stores per-user per-game cooldown timestamps (used by status + complete routes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.game_cooldowns (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type  TEXT        NOT NULL,
  cooldown_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, game_type)
);

CREATE INDEX IF NOT EXISTS idx_game_cooldowns_user_type ON public.game_cooldowns(user_id, game_type);
CREATE INDEX IF NOT EXISTS idx_game_cooldowns_until     ON public.game_cooldowns(cooldown_until);

ALTER TABLE public.game_cooldowns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_cooldowns_select_own"  ON public.game_cooldowns;
DROP POLICY IF EXISTS "game_cooldowns_service_all" ON public.game_cooldowns;
CREATE POLICY "game_cooldowns_select_own"  ON public.game_cooldowns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "game_cooldowns_service_all" ON public.game_cooldowns FOR ALL    USING (auth.jwt() ->> 'role' = 'service_role');

-- Helper: upsert a cooldown for a user+game
DROP FUNCTION IF EXISTS public.set_game_cooldown(UUID, TEXT, INTEGER) CASCADE;
CREATE OR REPLACE FUNCTION public.set_game_cooldown(
  p_user_id       UUID,
  p_game_type     TEXT,
  p_cooldown_minutes INTEGER DEFAULT 3
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.game_cooldowns (user_id, game_type, cooldown_until, updated_at)
  VALUES (p_user_id, p_game_type, NOW() + (p_cooldown_minutes || ' minutes')::INTERVAL, NOW())
  ON CONFLICT (user_id, game_type) DO UPDATE
    SET cooldown_until = NOW() + (p_cooldown_minutes || ' minutes')::INTERVAL,
        updated_at     = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- SECTION 5: GAME_TOURNAMENTS TABLE (used by /api/games/tournaments)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.game_tournaments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  game_type        TEXT        NOT NULL,
  start_time       TIMESTAMPTZ NOT NULL,
  end_time         TIMESTAMPTZ NOT NULL,
  prize_pool       INTEGER     NOT NULL DEFAULT 0,
  entry_fee        INTEGER     NOT NULL DEFAULT 0,
  participants     INTEGER     NOT NULL DEFAULT 0,
  max_participants INTEGER     NOT NULL DEFAULT 100,
  status           TEXT        NOT NULL DEFAULT 'upcoming'
                   CHECK (status IN ('active', 'upcoming', 'ended')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_tournaments_status ON public.game_tournaments(status);
CREATE INDEX IF NOT EXISTS idx_game_tournaments_start  ON public.game_tournaments(start_time);

ALTER TABLE public.game_tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_tournaments_select_all"   ON public.game_tournaments;
DROP POLICY IF EXISTS "game_tournaments_admin_all"    ON public.game_tournaments;
CREATE POLICY "game_tournaments_select_all"  ON public.game_tournaments FOR SELECT USING (true);
CREATE POLICY "game_tournaments_admin_all"   ON public.game_tournaments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- =============================================================================
-- SECTION 6: MANUAL_FAUCET_CLAIMS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.manual_faucet_claims (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crypto_symbol  VARCHAR(10)    NOT NULL,
  amount         DECIMAL(20,8)  NOT NULL,
  usd_value      DECIMAL(10,6)  NOT NULL DEFAULT 0.0009,
  ip_address     VARCHAR(45),
  fingerprint    VARCHAR(255),
  status         VARCHAR(20)    NOT NULL DEFAULT 'completed',
  faucetpay_tx_id VARCHAR(255),
  claimed_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Handle rename from old column name
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='manual_faucet_claims' AND column_name='faucetpay_payout_id')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='manual_faucet_claims' AND column_name='faucetpay_tx_id') THEN
    ALTER TABLE public.manual_faucet_claims RENAME COLUMN faucetpay_payout_id TO faucetpay_tx_id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_manual_faucet_user_id       ON public.manual_faucet_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_claimed_at    ON public.manual_faucet_claims(claimed_at);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_crypto_symbol ON public.manual_faucet_claims(crypto_symbol);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_ip_address    ON public.manual_faucet_claims(ip_address);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_user_crypto   ON public.manual_faucet_claims(user_id, crypto_symbol);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_tx_id         ON public.manual_faucet_claims(faucetpay_tx_id);

ALTER TABLE public.manual_faucet_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manual_faucet_select_own"  ON public.manual_faucet_claims;
DROP POLICY IF EXISTS "manual_faucet_service_all" ON public.manual_faucet_claims;
DROP POLICY IF EXISTS "manual_faucet_admin_select" ON public.manual_faucet_claims;
CREATE POLICY "manual_faucet_select_own"   ON public.manual_faucet_claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "manual_faucet_service_all"  ON public.manual_faucet_claims FOR ALL    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "manual_faucet_admin_select" ON public.manual_faucet_claims FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin','moderator')));

-- =============================================================================
-- SECTION 7: SYSTEM_SETTINGS — all keys used by the app
-- =============================================================================

INSERT INTO public.system_settings (key, value, description) VALUES
  ('base_claim_amount_satoshis',     '7',      'Base satoshis per faucet claim'),
  ('max_claim_amount_satoshis',      '100',    'Maximum satoshis per claim with bonuses'),
  ('claim_cooldown_seconds',         '300',    'Seconds between faucet claims'),
  ('streak_bonus_percentage',        '5',      'Bonus percentage per streak day'),
  ('max_streak_bonus_percentage',    '100',    'Maximum streak bonus percentage'),
  ('minimum_withdrawal_satoshis',    '1000',   'Minimum withdrawal in satoshis'),
  ('maximum_withdrawal_satoshis',    '50000',  'Maximum withdrawal per transaction'),
  ('daily_withdrawal_limit_satoshis','25000',  'Daily withdrawal limit per user'),
  ('withdrawal_fee_percentage',      '0',      'Withdrawal fee percentage'),
  ('manual_review_threshold',        '60',     'Fraud score triggering manual review'),
  ('auto_ban_threshold',             '95',     'Fraud score triggering auto ban'),
  ('max_accounts_per_ip',            '3',      'Max accounts from same IP'),
  ('max_accounts_per_device',        '2',      'Max accounts from same device'),
  ('faucetpay_enabled',              'true',   'Enable FaucetPay withdrawals'),
  ('signup_bonus_satoshis',          '10',     'Satoshis awarded on signup'),
  ('referral_bonus_satoshis',        '50',     'Satoshis per successful referral')
ON CONFLICT (key) DO NOTHING;

-- Fix RLS: both admin and superadmin can write settings
DROP POLICY IF EXISTS "system_settings_admin_all"    ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_select_all"   ON public.system_settings;
CREATE POLICY "system_settings_select_all" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "system_settings_admin_all"  ON public.system_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
GRANT ALL ON public.system_settings TO authenticated;

-- =============================================================================
-- SECTION 8: AD_SETTINGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ad_settings (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  position         VARCHAR(50)  NOT NULL UNIQUE,
  provider         VARCHAR(20)  NOT NULL DEFAULT 'aads',
  enabled          BOOLEAN      NOT NULL DEFAULT false,
  aads_id          VARCHAR(100),
  coinzilla_zone   VARCHAR(100),
  bitsmedia_id     VARCHAR(100),
  bitsmedia_slot   VARCHAR(100),
  impressions      INTEGER      NOT NULL DEFAULT 0,
  clicks           INTEGER      NOT NULL DEFAULT 0,
  revenue_satoshis BIGINT       NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO public.ad_settings (position, provider, enabled) VALUES
  ('sidebar',          'aads',      false),
  ('header',           'coinzilla', false),
  ('content',          'aads',      false),
  ('footer',           'bitsmedia', false),
  ('between-content',  'coinzilla', false)
ON CONFLICT (position) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_ad_settings_position ON public.ad_settings(position);
CREATE INDEX IF NOT EXISTS idx_ad_settings_enabled  ON public.ad_settings(enabled);

ALTER TABLE public.ad_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_settings_public_select" ON public.ad_settings;
DROP POLICY IF EXISTS "ad_settings_admin_all"     ON public.ad_settings;
CREATE POLICY "ad_settings_public_select" ON public.ad_settings FOR SELECT USING (true);
CREATE POLICY "ad_settings_admin_all"     ON public.ad_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- =============================================================================
-- SECTION 9: SHORTLINKS — add missing updated_at and admin policy
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shortlinks' AND column_name='updated_at') THEN
    ALTER TABLE public.shortlinks ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

DROP POLICY IF EXISTS "shortlinks_admin_all"    ON public.shortlinks;
DROP POLICY IF EXISTS "shortlinks_select_active" ON public.shortlinks;
CREATE POLICY "shortlinks_select_active" ON public.shortlinks FOR SELECT USING (is_active = true OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
CREATE POLICY "shortlinks_admin_all"     ON public.shortlinks FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- =============================================================================
-- SECTION 10: OFFERWALL_CONVERSIONS — add balance_update_failed metadata support
-- The retry cron queries status='pending'; ensure index exists.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_offerwall_conversions_status    ON public.offerwall_conversions(status);
CREATE INDEX IF NOT EXISTS idx_offerwall_conversions_user_status ON public.offerwall_conversions(user_id, status);

-- Allow service role full access (needed by retry cron)
DROP POLICY IF EXISTS "offerwall_conversions_service_all" ON public.offerwall_conversions;
CREATE POLICY "offerwall_conversions_service_all" ON public.offerwall_conversions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 11: RLS RECURSION FIX (profiles admin policies)
-- Uses SECURITY DEFINER functions to avoid infinite recursion.
-- =============================================================================

DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(v_role IN ('admin','superadmin','moderator'), FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

DROP FUNCTION IF EXISTS public.is_superadmin() CASCADE;
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(v_role IN ('admin','superadmin'), FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Rebuild profile policies using the SECURITY DEFINER functions
DROP POLICY IF EXISTS "profiles_select_own"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_select"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_all"   ON public.profiles;

CREATE POLICY "profiles_select_own"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own"   ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own"   ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_select" ON public.profiles FOR SELECT USING (public.is_admin());
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE USING (public.is_superadmin());
CREATE POLICY "profiles_service_all"  ON public.profiles FOR ALL    USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 12: ADBLOCK ANALYTICS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.adblock_analytics (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id       TEXT,
  ip_address       TEXT,
  adblock_detected BOOLEAN     NOT NULL DEFAULT FALSE,
  blocker_type     TEXT,
  confidence       INTEGER     DEFAULT 0,
  methods          TEXT[]      DEFAULT '{}',
  user_agent       TEXT,
  page_url         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adblock_analytics_created    ON public.adblock_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_adblock_analytics_user       ON public.adblock_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_adblock_analytics_detected   ON public.adblock_analytics(adblock_detected);

ALTER TABLE public.adblock_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "adblock_analytics_service_all" ON public.adblock_analytics;
DROP POLICY IF EXISTS "adblock_analytics_admin_select" ON public.adblock_analytics;
CREATE POLICY "adblock_analytics_service_all"  ON public.adblock_analytics FOR ALL    USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "adblock_analytics_admin_select" ON public.adblock_analytics FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- Helper RPC for adblock stats (used by admin analytics page)
DROP FUNCTION IF EXISTS public.get_adblock_stats(INTEGER) CASCADE;
CREATE OR REPLACE FUNCTION public.get_adblock_stats(p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  total_visits     BIGINT,
  adblock_detections BIGINT,
  detection_rate   NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_visits,
    COUNT(*) FILTER (WHERE adblock_detected)::BIGINT AS adblock_detections,
    ROUND(
      COUNT(*) FILTER (WHERE adblock_detected)::NUMERIC
      / NULLIF(COUNT(*), 0) * 100,
    2) AS detection_rate
  FROM public.adblock_analytics
  WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================================================
-- SECTION 13: IP_REPUTATION_CACHE + VPN_DETECTION_LOG (fortress tables)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ip_reputation_cache (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address      VARCHAR(45) UNIQUE NOT NULL,
  is_vpn          BOOLEAN     NOT NULL DEFAULT FALSE,
  is_proxy        BOOLEAN     NOT NULL DEFAULT FALSE,
  is_tor          BOOLEAN     NOT NULL DEFAULT FALSE,
  is_datacenter   BOOLEAN     NOT NULL DEFAULT FALSE,
  confidence      INTEGER     NOT NULL DEFAULT 0,
  risk_score      INTEGER     NOT NULL DEFAULT 0,
  provider        VARCHAR(255),
  country         VARCHAR(10),
  city            VARCHAR(255),
  isp             VARCHAR(255),
  asn             VARCHAR(50),
  methods         TEXT[]      DEFAULT '{}',
  consensus_data  JSONB       DEFAULT '{}',
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_reputation_ip           ON public.ip_reputation_cache(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_reputation_last_checked ON public.ip_reputation_cache(last_checked_at);

ALTER TABLE public.ip_reputation_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ip_reputation_service_all" ON public.ip_reputation_cache;
CREATE POLICY "ip_reputation_service_all" ON public.ip_reputation_cache FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TABLE IF NOT EXISTS public.vpn_detection_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address    VARCHAR(45) NOT NULL,
  is_vpn        BOOLEAN     NOT NULL DEFAULT FALSE,
  is_proxy      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_tor        BOOLEAN     NOT NULL DEFAULT FALSE,
  is_datacenter BOOLEAN     NOT NULL DEFAULT FALSE,
  confidence    INTEGER     NOT NULL DEFAULT 0,
  risk_score    INTEGER     NOT NULL DEFAULT 0,
  risk_level    VARCHAR(20) NOT NULL DEFAULT 'none',
  should_block  BOOLEAN     NOT NULL DEFAULT FALSE,
  methods       TEXT[]      DEFAULT '{}',
  consensus     JSONB       DEFAULT '{}',
  details       JSONB       DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vpn_log_user    ON public.vpn_detection_log(user_id);
CREATE INDEX IF NOT EXISTS idx_vpn_log_ip      ON public.vpn_detection_log(ip_address);
CREATE INDEX IF NOT EXISTS idx_vpn_log_created ON public.vpn_detection_log(created_at);

ALTER TABLE public.vpn_detection_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vpn_log_service_all" ON public.vpn_detection_log;
CREATE POLICY "vpn_log_service_all" ON public.vpn_detection_log FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 14: ADVERTISING TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT           NOT NULL,
  network         TEXT           NOT NULL,
  network_name    TEXT           NOT NULL,
  budget          DECIMAL(12,2)  NOT NULL,
  daily_budget    DECIMAL(12,2)  NOT NULL,
  spent           DECIMAL(12,2)  NOT NULL DEFAULT 0,
  target_url      TEXT           NOT NULL,
  title           TEXT           NOT NULL,
  description     TEXT,
  image_url       TEXT,
  target_countries TEXT[]        DEFAULT '{}',
  start_date      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  end_date        TIMESTAMPTZ,
  status          TEXT           NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','paused','stopped','completed')),
  impressions     INTEGER        NOT NULL DEFAULT 0,
  clicks          INTEGER        NOT NULL DEFAULT 0,
  cpm             DECIMAL(6,2),
  metadata        JSONB          DEFAULT '{}',
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_user   ON public.ad_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON public.ad_campaigns(status);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_campaigns_select_own"   ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_insert_own"   ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_service_all"  ON public.ad_campaigns;
CREATE POLICY "ad_campaigns_select_own"  ON public.ad_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ad_campaigns_insert_own"  ON public.ad_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ad_campaigns_service_all" ON public.ad_campaigns FOR ALL    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TABLE IF NOT EXISTS public.ad_transactions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id     UUID          REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  type            TEXT          NOT NULL CHECK (type IN ('deposit','campaign_created','campaign_refund','impression','click','adjustment')),
  amount          DECIMAL(12,2) NOT NULL,
  balance_before  DECIMAL(12,2),
  balance_after   DECIMAL(12,2),
  description     TEXT,
  metadata        JSONB         DEFAULT '{}',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_transactions_user     ON public.ad_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_transactions_campaign ON public.ad_transactions(campaign_id);

ALTER TABLE public.ad_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_transactions_select_own"  ON public.ad_transactions;
DROP POLICY IF EXISTS "ad_transactions_service_all" ON public.ad_transactions;
CREATE POLICY "ad_transactions_select_own"  ON public.ad_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ad_transactions_service_all" ON public.ad_transactions FOR ALL    USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 15: ACHIEVEMENTS — ensure is_active column exists and seed if empty
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='achievements' AND column_name='is_active') THEN
    ALTER TABLE public.achievements ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

-- Grant service role access
DROP POLICY IF EXISTS "achievements_service_all"   ON public.achievements;
DROP POLICY IF EXISTS "user_achievements_service_all" ON public.user_achievements;
CREATE POLICY "achievements_service_all"      ON public.achievements      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "user_achievements_service_all" ON public.user_achievements FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 16: TRANSACTIONS TABLE — add missing index on offerwall_conversion_id
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='offerwall_conversion_id') THEN
    ALTER TABLE public.transactions ADD COLUMN offerwall_conversion_id UUID REFERENCES public.offerwall_conversions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_type        ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type   ON public.transactions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_status      ON public.transactions(status);

-- Service role policy
DROP POLICY IF EXISTS "transactions_service_all" ON public.transactions;
CREATE POLICY "transactions_service_all" ON public.transactions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 17: AUDIT_LOGS — admin read access
-- =============================================================================

DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select" ON public.audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin','moderator')));
DROP POLICY IF EXISTS "audit_logs_service_all" ON public.audit_logs;
CREATE POLICY "audit_logs_service_all" ON public.audit_logs FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 18: NOTIFICATIONS — service role access
-- =============================================================================

DROP POLICY IF EXISTS "notifications_service_all" ON public.notifications;
CREATE POLICY "notifications_service_all" ON public.notifications FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 19: FRAUD_FLAGS — admin select + service all
-- =============================================================================

DROP POLICY IF EXISTS "fraud_flags_admin_select" ON public.fraud_flags;
DROP POLICY IF EXISTS "fraud_flags_service_all"  ON public.fraud_flags;
CREATE POLICY "fraud_flags_admin_select" ON public.fraud_flags FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin','moderator')));
CREATE POLICY "fraud_flags_service_all"  ON public.fraud_flags FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 20: WITHDRAWALS — admin select + service all
-- =============================================================================

DROP POLICY IF EXISTS "withdrawals_admin_select" ON public.withdrawals;
DROP POLICY IF EXISTS "withdrawals_service_all"  ON public.withdrawals;
CREATE POLICY "withdrawals_admin_select" ON public.withdrawals FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
CREATE POLICY "withdrawals_service_all"  ON public.withdrawals FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 21: GRANTS — ensure authenticated and service_role have proper access
-- =============================================================================

-- Targeted grants (GRANT ON ALL TABLES causes .map() errors in Supabase dashboard)
DO $$ BEGIN
  GRANT USAGE ON SCHEMA public TO authenticated, service_role, anon;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN GRANT ALL ON public.profiles               TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.transactions           TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.withdrawals            TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.notifications          TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.audit_logs             TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.fraud_flags            TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.game_sessions          TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.game_cooldowns         TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.game_tournaments       TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.manual_faucet_claims   TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.system_settings        TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.ad_settings            TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.shortlinks             TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.shortlink_views        TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.offerwall_conversions  TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.offerwall_providers    TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.achievements           TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.user_achievements      TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.ptc_ads                TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.ptc_views              TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.adblock_analytics      TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.ip_reputation_cache    TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.vpn_detection_log      TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.ad_campaigns           TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT ALL ON public.ad_transactions        TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =============================================================================
-- DONE
-- =============================================================================

SELECT 'Faucero DB fix script completed successfully' AS status;
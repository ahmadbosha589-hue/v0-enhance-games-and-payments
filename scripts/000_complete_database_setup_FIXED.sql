-- =============================================================================
-- FAUCERO - COMPLETE DATABASE SETUP SCRIPT
-- Run this ONCE on a fresh Supabase project to set up all tables.
-- This is the master script that creates everything from scratch.
-- =============================================================================

-- =============================================================================
-- SECTION 1: ENUM TYPES
-- =============================================================================

-- User roles for RBAC
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin', 'superadmin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Account status
DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'suspended', 'banned', 'pending_verification');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transaction types
DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM (
    'claim', 'referral_bonus', 'withdrawal', 'adjustment', 'bonus',
    'daily_bonus', 'streak_bonus', 'signup_bonus', 'achievement',
    'offerwall', 'ptc', 'game', 'referral', 'shortlink', 'coupon', 'manual_faucet'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transaction status
DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Withdrawal status
DO $$ BEGIN
  CREATE TYPE withdrawal_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'flagged');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fraud flag status
DO $$ BEGIN
  CREATE TYPE fraud_flag_status AS ENUM ('pending_review', 'confirmed_fraud', 'false_positive', 'under_investigation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Audit action types
DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'user_created', 'user_updated', 'user_banned', 'user_unbanned',
    'claim_created', 'claim_flagged',
    'withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_completed',
    'referral_created', 'referral_bonus_paid',
    'fraud_flag_created', 'fraud_flag_resolved',
    'admin_action', 'system_action'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notification types
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'claim_success', 'withdrawal_completed', 'withdrawal_failed',
    'referral_signup', 'referral_bonus', 'account_warning',
    'system_announcement', 'security_alert'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tournament types
DO $$ BEGIN
  CREATE TYPE tournament_period AS ENUM ('daily', 'weekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tournament_category AS ENUM ('faucet_claims', 'offerwall_earnings', 'highest_earners');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tournament_status AS ENUM ('upcoming', 'active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- SECTION 2: HELPER FUNCTIONS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 3: PROFILES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  role user_role DEFAULT 'user' NOT NULL,
  status account_status DEFAULT 'active' NOT NULL,
  balance_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (balance_satoshis >= 0),
  total_earned_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (total_earned_satoshis >= 0),
  total_withdrawn_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (total_withdrawn_satoshis >= 0),
  referral_code TEXT UNIQUE NOT NULL,
  referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  referral_count INTEGER DEFAULT 0 NOT NULL CHECK (referral_count >= 0),
  referral_earnings_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (referral_earnings_satoshis >= 0),
  last_claim_at TIMESTAMPTZ,
  total_claims INTEGER DEFAULT 0 NOT NULL CHECK (total_claims >= 0),
  claim_streak INTEGER DEFAULT 0 NOT NULL CHECK (claim_streak >= 0),
  max_claim_streak INTEGER DEFAULT 0 NOT NULL CHECK (max_claim_streak >= 0),
  two_factor_enabled BOOLEAN DEFAULT FALSE NOT NULL,
  two_factor_secret TEXT,
  fraud_score INTEGER DEFAULT 0 NOT NULL CHECK (fraud_score >= 0 AND fraud_score <= 100),
  is_flagged BOOLEAN DEFAULT FALSE NOT NULL,
  faucetpay_email TEXT,
  faucetpay_verified BOOLEAN DEFAULT FALSE NOT NULL,
  last_daily_bonus_at TIMESTAMPTZ,
  total_daily_bonuses INTEGER DEFAULT 0 NOT NULL,
  adblock_flagged BOOLEAN DEFAULT FALSE NOT NULL,
  fraud_flags JSONB DEFAULT '[]'::jsonb,
  cooldown_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_active_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  banned_at TIMESTAMPTZ,
  banned_reason TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_fraud_score ON public.profiles(fraud_score);
CREATE INDEX IF NOT EXISTS idx_profiles_is_flagged ON public.profiles(is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_faucetpay_email ON public.profiles(faucetpay_email) WHERE faucetpay_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_last_daily_bonus_at ON public.profiles(last_daily_bonus_at);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 4: CLAIMS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_satoshis BIGINT NOT NULL CHECK (amount_satoshis > 0),
  base_amount_satoshis BIGINT NOT NULL CHECK (base_amount_satoshis > 0),
  streak_bonus_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (streak_bonus_satoshis >= 0),
  referral_bonus_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (referral_bonus_satoshis >= 0),
  streak_day INTEGER DEFAULT 1 NOT NULL,
  ip_address INET NOT NULL,
  user_agent TEXT,
  device_fingerprint TEXT,
  fraud_score INTEGER DEFAULT 0 NOT NULL CHECK (fraud_score >= 0 AND fraud_score <= 100),
  is_flagged BOOLEAN DEFAULT FALSE NOT NULL,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on claims
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS amount_satoshis BIGINT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS base_amount_satoshis BIGINT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS streak_bonus_satoshis BIGINT DEFAULT 0;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS referral_bonus_satoshis BIGINT DEFAULT 0;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS streak_day INTEGER DEFAULT 1;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS fraud_score INTEGER DEFAULT 0;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT FALSE;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS flag_reason TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_claims_user_id ON public.claims(user_id);
CREATE INDEX IF NOT EXISTS idx_claims_created_at ON public.claims(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_ip_address ON public.claims(ip_address);
CREATE INDEX IF NOT EXISTS idx_claims_device_fingerprint ON public.claims(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_claims_is_flagged ON public.claims(is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX IF NOT EXISTS idx_claims_user_date ON public.claims(user_id, created_at DESC);

-- =============================================================================
-- SECTION 5: TRANSACTIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  status transaction_status DEFAULT 'pending' NOT NULL,
  amount_satoshis BIGINT NOT NULL,
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
  withdrawal_id UUID,
  referral_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ
);

-- Ensure all expected columns exist (handles tables created by older schema versions, MUST be before indexes)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS type transaction_type;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS status transaction_status DEFAULT 'pending';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS amount_satoshis BIGINT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS balance_before BIGINT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS balance_after BIGINT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS claim_id UUID;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS withdrawal_id UUID;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS referral_id UUID;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_claim_id ON public.transactions(claim_id);
CREATE INDEX IF NOT EXISTS idx_transactions_withdrawal_id ON public.transactions(withdrawal_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 6: WITHDRAWALS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_satoshis BIGINT NOT NULL CHECK (amount_satoshis > 0),
  fee_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (fee_satoshis >= 0),
  net_amount_satoshis BIGINT NOT NULL CHECK (net_amount_satoshis > 0),
  status withdrawal_status DEFAULT 'pending' NOT NULL,
  payment_method TEXT DEFAULT 'faucetpay' NOT NULL,
  payment_address TEXT NOT NULL,
  payment_currency TEXT DEFAULT 'BTC' NOT NULL,
  faucetpay_payout_id TEXT,
  faucetpay_response JSONB,
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  fraud_score INTEGER DEFAULT 0 NOT NULL CHECK (fraud_score >= 0 AND fraud_score <= 100),
  is_flagged BOOLEAN DEFAULT FALSE NOT NULL,
  flag_reason TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on withdrawals
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS amount_satoshis BIGINT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS fee_satoshis BIGINT DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS net_amount_satoshis BIGINT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS status withdrawal_status DEFAULT 'pending';
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'faucetpay';
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS payment_address TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS payment_currency TEXT DEFAULT 'BTC';
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS faucetpay_payout_id TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS faucetpay_response JSONB;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS fraud_score INTEGER DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT FALSE;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS flag_reason TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON public.withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON public.withdrawals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_is_flagged ON public.withdrawals(is_flagged) WHERE is_flagged = TRUE;

-- Add FK to transactions
DO $$ BEGIN
  ALTER TABLE public.transactions 
  ADD CONSTRAINT fk_transactions_withdrawal 
  FOREIGN KEY (withdrawal_id) REFERENCES public.withdrawals(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- SECTION 7: SYSTEM SETTINGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Insert default settings
INSERT INTO public.system_settings (key, value, description) VALUES
  ('base_claim_amount_satoshis', '7', 'Base satoshis per faucet claim'),
  ('max_claim_amount_satoshis', '100', 'Maximum satoshis per claim with bonuses'),
  ('claim_cooldown_seconds', '300', 'Seconds between faucet claims'),
  ('streak_bonus_percentage', '5', 'Bonus percentage per streak day'),
  ('max_streak_bonus_percentage', '100', 'Maximum streak bonus percentage'),
  ('minimum_withdrawal_satoshis', '1000', 'Minimum withdrawal in satoshis'),
  ('maximum_withdrawal_satoshis', '50000', 'Maximum withdrawal per transaction'),
  ('daily_withdrawal_limit_satoshis', '25000', 'Daily withdrawal limit per user'),
  ('withdrawal_fee_percentage', '0', 'Withdrawal fee percentage'),
  ('manual_review_threshold', '60', 'Fraud score triggering manual review'),
  ('auto_ban_threshold', '95', 'Fraud score triggering auto ban'),
  ('max_accounts_per_ip', '3', 'Max accounts from same IP'),
  ('max_accounts_per_device', '2', 'Max accounts from same device'),
  ('faucetpay_enabled', 'true', 'Enable FaucetPay withdrawals'),
  ('signup_bonus_satoshis', '10', 'Satoshis awarded on signup'),
  ('referral_bonus_satoshis', '50', 'Satoshis per successful referral'),
  ('maintenance_mode', 'false', 'Enable maintenance mode'),
  ('registration_enabled', 'true', 'Enable new user registration')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- SECTION 8: TOURNAMENTS TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'faucet_claims',
  period TEXT NOT NULL DEFAULT 'daily',
  name TEXT NOT NULL,
  description TEXT,
  prize_pool BIGINT DEFAULT 0 NOT NULL CHECK (prize_pool >= 0),
  prizes JSONB DEFAULT '[{"rank": 1, "percentage": 50}, {"rank": 2, "percentage": 30}, {"rank": 3, "percentage": 20}]'::JSONB NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on tournaments (MUST be before indexes)
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'faucet_claims';
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS period TEXT DEFAULT 'daily';
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS prize_pool BIGINT DEFAULT 0;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS prizes JSONB DEFAULT '[{"rank": 1, "percentage": 50}, {"rank": 2, "percentage": 30}, {"rank": 3, "percentage": 20}]'::JSONB;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_type ON public.tournaments(type);
CREATE INDEX IF NOT EXISTS idx_tournaments_period ON public.tournaments(period);
CREATE INDEX IF NOT EXISTS idx_tournaments_dates ON public.tournaments(starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.tournament_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score BIGINT DEFAULT 0 NOT NULL CHECK (score >= 0),
  rank INTEGER,
  prize_amount BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT unique_tournament_participant UNIQUE (tournament_id, user_id)
);

ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on tournament_participants
ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE;
ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS score BIGINT DEFAULT 0;
ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS rank INTEGER;
ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS prize_amount BIGINT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON public.tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user ON public.tournament_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_score ON public.tournament_participants(tournament_id, score DESC);

-- =============================================================================
-- SECTION 9: FRAUD FLAGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,
  severity INTEGER DEFAULT 50 NOT NULL CHECK (severity >= 0 AND severity <= 100),
  status fraud_flag_status DEFAULT 'pending_review' NOT NULL,
  description TEXT,
  evidence JSONB DEFAULT '{}',
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on fraud_flags
ALTER TABLE public.fraud_flags ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.fraud_flags ADD COLUMN IF NOT EXISTS flag_type TEXT;
ALTER TABLE public.fraud_flags ADD COLUMN IF NOT EXISTS severity INTEGER DEFAULT 50;
ALTER TABLE public.fraud_flags ADD COLUMN IF NOT EXISTS status fraud_flag_status DEFAULT 'pending_review';
ALTER TABLE public.fraud_flags ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.fraud_flags ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}';
ALTER TABLE public.fraud_flags ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.fraud_flags ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.fraud_flags ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_fraud_flags_user_id ON public.fraud_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_status ON public.fraud_flags(status);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_severity ON public.fraud_flags(severity DESC);

-- =============================================================================
-- SECTION 10: DEVICE FINGERPRINTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.device_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fingerprint_hash TEXT NOT NULL,
  fingerprint_data JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  is_trusted BOOLEAN DEFAULT FALSE NOT NULL,
  is_blocked BOOLEAN DEFAULT FALSE NOT NULL,
  CONSTRAINT unique_user_fingerprint UNIQUE (user_id, fingerprint_hash)
);

ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on device_fingerprints
ALTER TABLE public.device_fingerprints ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.device_fingerprints ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT;
ALTER TABLE public.device_fingerprints ADD COLUMN IF NOT EXISTS fingerprint_data JSONB DEFAULT '{}';
ALTER TABLE public.device_fingerprints ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.device_fingerprints ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.device_fingerprints ADD COLUMN IF NOT EXISTS is_trusted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.device_fingerprints ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user ON public.device_fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_hash ON public.device_fingerprints(fingerprint_hash);

-- =============================================================================
-- SECTION 11: IP ADDRESSES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ip_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  first_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_count INTEGER DEFAULT 1 NOT NULL,
  is_vpn BOOLEAN DEFAULT FALSE NOT NULL,
  is_proxy BOOLEAN DEFAULT FALSE NOT NULL,
  is_tor BOOLEAN DEFAULT FALSE NOT NULL,
  is_datacenter BOOLEAN DEFAULT FALSE NOT NULL,
  is_blocked BOOLEAN DEFAULT FALSE NOT NULL,
  country_code TEXT,
  risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ip_addresses_ip ON public.ip_addresses(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_addresses_blocked ON public.ip_addresses(is_blocked) WHERE is_blocked = TRUE;

ALTER TABLE public.ip_addresses ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 12: AUDIT LOGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action audit_action NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action audit_action;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_values JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_values JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- =============================================================================
-- SECTION 13: NOTIFICATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Ensure all expected columns exist on notifications (handles tables created by older schema versions)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type notification_type;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(user_id, read_at) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 14: AD SETTINGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ad_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position VARCHAR(50) NOT NULL UNIQUE,
  provider VARCHAR(20) NOT NULL DEFAULT 'aads',
  enabled BOOLEAN NOT NULL DEFAULT false,
  aads_id VARCHAR(100),
  coinzilla_zone VARCHAR(100),
  bitsmedia_id VARCHAR(100),
  bitsmedia_slot VARCHAR(100),
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  revenue_satoshis BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ad_settings (position, provider, enabled) VALUES
  ('sidebar', 'aads', false),
  ('header', 'coinzilla', false),
  ('content', 'aads', false),
  ('footer', 'bitsmedia', false),
  ('between-content', 'coinzilla', false)
ON CONFLICT (position) DO NOTHING;

ALTER TABLE public.ad_settings ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 15: ADBLOCK ANALYTICS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.adblock_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id TEXT,
  adblock_detected BOOLEAN NOT NULL DEFAULT false,
  page_url TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.adblock_analytics ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on adblock_analytics
ALTER TABLE public.adblock_analytics ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.adblock_analytics ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE public.adblock_analytics ADD COLUMN IF NOT EXISTS adblock_detected BOOLEAN DEFAULT FALSE;
ALTER TABLE public.adblock_analytics ADD COLUMN IF NOT EXISTS page_url TEXT;
ALTER TABLE public.adblock_analytics ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.adblock_analytics ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_adblock_analytics_user ON public.adblock_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_adblock_analytics_detected ON public.adblock_analytics(adblock_detected);
CREATE INDEX IF NOT EXISTS idx_adblock_analytics_created ON public.adblock_analytics(created_at DESC);

-- =============================================================================
-- SECTION 16: SHORTLINKS & COUPONS TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.shortlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT,                                          -- kept for legacy; code uses destination_url
  destination_url TEXT,                              -- FIX: code references destination_url not url
  reward_satoshis INTEGER NOT NULL DEFAULT 5 CHECK (reward_satoshis > 0),
  view_time_seconds INTEGER NOT NULL DEFAULT 15,     -- FIX: code references view_time_seconds
  daily_limit INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  total_views INTEGER DEFAULT 0 NOT NULL,            -- FIX: code references total_views not views_count
  views_count INTEGER DEFAULT 0 NOT NULL,            -- kept for legacy
  claims_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shortlinks_active ON public.shortlinks(is_active);
ALTER TABLE public.shortlinks ENABLE ROW LEVEL SECURITY;

-- FIX: Add columns referenced by code but missing from older schema versions
ALTER TABLE public.shortlinks ADD COLUMN IF NOT EXISTS destination_url TEXT;
ALTER TABLE public.shortlinks ADD COLUMN IF NOT EXISTS view_time_seconds INTEGER DEFAULT 15;
ALTER TABLE public.shortlinks ADD COLUMN IF NOT EXISTS total_views INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.shortlink_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shortlink_id UUID NOT NULL REFERENCES public.shortlinks(id) ON DELETE CASCADE,
  reward_satoshis INTEGER NOT NULL,
  ip_address TEXT,
  claim_date DATE DEFAULT CURRENT_DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT unique_daily_shortlink_claim UNIQUE (user_id, shortlink_id, claim_date)
);

ALTER TABLE public.shortlink_claims ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on shortlink_claims
ALTER TABLE public.shortlink_claims ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.shortlink_claims ADD COLUMN IF NOT EXISTS shortlink_id UUID REFERENCES public.shortlinks(id) ON DELETE CASCADE;
ALTER TABLE public.shortlink_claims ADD COLUMN IF NOT EXISTS reward_satoshis INTEGER;
ALTER TABLE public.shortlink_claims ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.shortlink_claims ADD COLUMN IF NOT EXISTS claim_date DATE DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_shortlink_claims_user ON public.shortlink_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_shortlink_claims_shortlink ON public.shortlink_claims(shortlink_id);

CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  reward_satoshis INTEGER NOT NULL CHECK (reward_satoshis > 0),
  max_uses INTEGER DEFAULT 100,
  uses_count INTEGER DEFAULT 0 NOT NULL,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(is_active);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.coupon_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  reward_satoshis INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT unique_coupon_claim UNIQUE (user_id, coupon_id)
);

ALTER TABLE public.coupon_claims ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on coupon_claims
ALTER TABLE public.coupon_claims ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.coupon_claims ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id) ON DELETE CASCADE;
ALTER TABLE public.coupon_claims ADD COLUMN IF NOT EXISTS reward_satoshis INTEGER;

CREATE INDEX IF NOT EXISTS idx_coupon_claims_user ON public.coupon_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_claims_coupon ON public.coupon_claims(coupon_id);

-- =============================================================================
-- SECTION 17: OFFERWALL CONVERSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.offerwall_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  offerwall TEXT NOT NULL,
  offer_id TEXT,
  offer_name TEXT,
  amount_satoshis BIGINT NOT NULL CHECK (amount_satoshis > 0),
  payout_usd DECIMAL(10, 4),
  status TEXT DEFAULT 'pending' NOT NULL,
  transaction_id TEXT UNIQUE,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  credited_at TIMESTAMPTZ
);

ALTER TABLE public.offerwall_conversions ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on offerwall_conversions
ALTER TABLE public.offerwall_conversions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.offerwall_conversions ADD COLUMN IF NOT EXISTS offerwall TEXT;
ALTER TABLE public.offerwall_conversions ADD COLUMN IF NOT EXISTS offer_id TEXT;
ALTER TABLE public.offerwall_conversions ADD COLUMN IF NOT EXISTS offer_name TEXT;
ALTER TABLE public.offerwall_conversions ADD COLUMN IF NOT EXISTS amount_satoshis BIGINT;
ALTER TABLE public.offerwall_conversions ADD COLUMN IF NOT EXISTS payout_usd DECIMAL(10,4);
ALTER TABLE public.offerwall_conversions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.offerwall_conversions ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE public.offerwall_conversions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.offerwall_conversions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.offerwall_conversions ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_offerwall_conversions_user ON public.offerwall_conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_offerwall_conversions_offerwall ON public.offerwall_conversions(offerwall);
CREATE INDEX IF NOT EXISTS idx_offerwall_conversions_status ON public.offerwall_conversions(status);
CREATE INDEX IF NOT EXISTS idx_offerwall_conversions_tx ON public.offerwall_conversions(transaction_id);

-- =============================================================================
-- SECTION 18: GAME SESSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'completed', 'abandoned', 'expired')),
  score INTEGER DEFAULT 0,
  reward_satoshis INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  ip_address TEXT,
  fingerprint_hash TEXT,
  min_score_required INTEGER DEFAULT 0,
  difficulty_level INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}'
);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on game_sessions
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS game_type TEXT;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS reward_satoshis INTEGER DEFAULT 0;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW(); -- FIX: was missing, caused "column started_at does not exist"
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS min_score_required INTEGER DEFAULT 0;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS difficulty_level INTEGER DEFAULT 1;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_game_sessions_user ON public.game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game ON public.game_sessions(game_type);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON public.game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created ON public.game_sessions(started_at DESC);

-- =============================================================================
-- SECTION 19: GAME COOLDOWNS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.game_cooldowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  cooldown_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, game_type)
);

ALTER TABLE public.game_cooldowns ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on game_cooldowns
ALTER TABLE public.game_cooldowns ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.game_cooldowns ADD COLUMN IF NOT EXISTS game_type TEXT;
ALTER TABLE public.game_cooldowns ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_game_cooldowns_user_type ON public.game_cooldowns(user_id, game_type);

-- =============================================================================
-- SECTION 20: MANUAL FAUCET CLAIMS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.manual_faucet_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crypto_symbol VARCHAR(10) NOT NULL,
  amount DECIMAL(20,8) NOT NULL,
  usd_value DECIMAL(10,6) NOT NULL DEFAULT 0.0009,
  ip_address VARCHAR(45),
  fingerprint VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  faucetpay_tx_id VARCHAR(255),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.manual_faucet_claims ENABLE ROW LEVEL SECURITY;

-- Ensure all expected columns exist on manual_faucet_claims
ALTER TABLE public.manual_faucet_claims ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.manual_faucet_claims ADD COLUMN IF NOT EXISTS crypto_symbol VARCHAR(10);
ALTER TABLE public.manual_faucet_claims ADD COLUMN IF NOT EXISTS amount DECIMAL(20,8);
ALTER TABLE public.manual_faucet_claims ADD COLUMN IF NOT EXISTS usd_value DECIMAL(10,6) DEFAULT 0.0009;
ALTER TABLE public.manual_faucet_claims ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
ALTER TABLE public.manual_faucet_claims ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(255);
ALTER TABLE public.manual_faucet_claims ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';
ALTER TABLE public.manual_faucet_claims ADD COLUMN IF NOT EXISTS faucetpay_tx_id VARCHAR(255);
ALTER TABLE public.manual_faucet_claims ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_manual_faucet_user ON public.manual_faucet_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_claimed ON public.manual_faucet_claims(claimed_at);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_crypto ON public.manual_faucet_claims(crypto_symbol);

-- =============================================================================
-- SECTION 21: RLS HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(v_role IN ('admin','superadmin','moderator'), FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(v_role IN ('admin','superadmin'), FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================================================
-- SECTION 22: RLS POLICIES
-- =============================================================================

-- Profiles policies
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_all" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_select" ON public.profiles FOR SELECT USING (public.is_admin());
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE USING (public.is_superadmin());
CREATE POLICY "profiles_service_all" ON public.profiles FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Claims policies
DROP POLICY IF EXISTS "claims_select_own" ON public.claims;
DROP POLICY IF EXISTS "claims_insert_system" ON public.claims;
DROP POLICY IF EXISTS "claims_admin_select" ON public.claims;
DROP POLICY IF EXISTS "claims_service_all" ON public.claims;

CREATE POLICY "claims_select_own" ON public.claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "claims_insert_system" ON public.claims FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "claims_admin_select" ON public.claims FOR SELECT USING (public.is_admin());
CREATE POLICY "claims_service_all" ON public.claims FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Transactions policies
DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_system" ON public.transactions;
DROP POLICY IF EXISTS "transactions_admin_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_service_all" ON public.transactions;

CREATE POLICY "transactions_select_own" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "transactions_insert_system" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "transactions_admin_select" ON public.transactions FOR SELECT USING (public.is_admin());
CREATE POLICY "transactions_service_all" ON public.transactions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Withdrawals policies
DROP POLICY IF EXISTS "withdrawals_select_own" ON public.withdrawals;
DROP POLICY IF EXISTS "withdrawals_insert_own" ON public.withdrawals;
DROP POLICY IF EXISTS "withdrawals_admin_select" ON public.withdrawals;
DROP POLICY IF EXISTS "withdrawals_admin_update" ON public.withdrawals;
DROP POLICY IF EXISTS "withdrawals_service_all" ON public.withdrawals;

CREATE POLICY "withdrawals_select_own" ON public.withdrawals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "withdrawals_insert_own" ON public.withdrawals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "withdrawals_admin_select" ON public.withdrawals FOR SELECT USING (public.is_admin());
CREATE POLICY "withdrawals_admin_update" ON public.withdrawals FOR UPDATE USING (public.is_superadmin());
CREATE POLICY "withdrawals_service_all" ON public.withdrawals FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- System settings policies
DROP POLICY IF EXISTS "system_settings_select_all" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_admin_all" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_service_all" ON public.system_settings;

CREATE POLICY "system_settings_select_all" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "system_settings_admin_all" ON public.system_settings FOR ALL USING (public.is_superadmin());
CREATE POLICY "system_settings_service_all" ON public.system_settings FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Tournaments policies
DROP POLICY IF EXISTS "tournaments_select_all" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_admin_all" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_service_all" ON public.tournaments;

CREATE POLICY "tournaments_select_all" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments_admin_all" ON public.tournaments FOR ALL USING (public.is_superadmin());
CREATE POLICY "tournaments_service_all" ON public.tournaments FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Tournament participants policies
DROP POLICY IF EXISTS "tournament_participants_select_all" ON public.tournament_participants;
DROP POLICY IF EXISTS "tournament_participants_insert_own" ON public.tournament_participants;
DROP POLICY IF EXISTS "tournament_participants_service_all" ON public.tournament_participants;

CREATE POLICY "tournament_participants_select_all" ON public.tournament_participants FOR SELECT USING (true);
CREATE POLICY "tournament_participants_insert_own" ON public.tournament_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tournament_participants_service_all" ON public.tournament_participants FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Ad settings policies
DROP POLICY IF EXISTS "ad_settings_public_select" ON public.ad_settings;
DROP POLICY IF EXISTS "ad_settings_admin_all" ON public.ad_settings;

CREATE POLICY "ad_settings_public_select" ON public.ad_settings FOR SELECT USING (true);
CREATE POLICY "ad_settings_admin_all" ON public.ad_settings FOR ALL USING (public.is_superadmin());

-- Shortlinks policies
DROP POLICY IF EXISTS "shortlinks_select_active" ON public.shortlinks;
DROP POLICY IF EXISTS "shortlinks_admin_all" ON public.shortlinks;

CREATE POLICY "shortlinks_select_active" ON public.shortlinks FOR SELECT USING (is_active = true OR public.is_admin());
CREATE POLICY "shortlinks_admin_all" ON public.shortlinks FOR ALL USING (public.is_superadmin());

-- Shortlink claims policies
DROP POLICY IF EXISTS "shortlink_claims_select_own" ON public.shortlink_claims;
DROP POLICY IF EXISTS "shortlink_claims_insert_own" ON public.shortlink_claims;
DROP POLICY IF EXISTS "shortlink_claims_service_all" ON public.shortlink_claims;

CREATE POLICY "shortlink_claims_select_own" ON public.shortlink_claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "shortlink_claims_insert_own" ON public.shortlink_claims FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shortlink_claims_service_all" ON public.shortlink_claims FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Coupons policies
DROP POLICY IF EXISTS "coupons_select_active" ON public.coupons;
DROP POLICY IF EXISTS "coupons_admin_all" ON public.coupons;

CREATE POLICY "coupons_select_active" ON public.coupons FOR SELECT USING (is_active = true OR public.is_admin());
CREATE POLICY "coupons_admin_all" ON public.coupons FOR ALL USING (public.is_superadmin());

-- Coupon claims policies
DROP POLICY IF EXISTS "coupon_claims_select_own" ON public.coupon_claims;
DROP POLICY IF EXISTS "coupon_claims_insert_own" ON public.coupon_claims;
DROP POLICY IF EXISTS "coupon_claims_service_all" ON public.coupon_claims;

CREATE POLICY "coupon_claims_select_own" ON public.coupon_claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "coupon_claims_insert_own" ON public.coupon_claims FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "coupon_claims_service_all" ON public.coupon_claims FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Offerwall conversions policies
DROP POLICY IF EXISTS "offerwall_conversions_select_own" ON public.offerwall_conversions;
DROP POLICY IF EXISTS "offerwall_conversions_admin_select" ON public.offerwall_conversions;
DROP POLICY IF EXISTS "offerwall_conversions_service_all" ON public.offerwall_conversions;

CREATE POLICY "offerwall_conversions_select_own" ON public.offerwall_conversions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "offerwall_conversions_admin_select" ON public.offerwall_conversions FOR SELECT USING (public.is_admin());
CREATE POLICY "offerwall_conversions_service_all" ON public.offerwall_conversions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Game sessions policies
DROP POLICY IF EXISTS "game_sessions_select_own" ON public.game_sessions;
DROP POLICY IF EXISTS "game_sessions_insert_own" ON public.game_sessions;
DROP POLICY IF EXISTS "game_sessions_update_own" ON public.game_sessions;
DROP POLICY IF EXISTS "game_sessions_service_all" ON public.game_sessions;

CREATE POLICY "game_sessions_select_own" ON public.game_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "game_sessions_insert_own" ON public.game_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "game_sessions_update_own" ON public.game_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "game_sessions_service_all" ON public.game_sessions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Game cooldowns policies
DROP POLICY IF EXISTS "game_cooldowns_select_own" ON public.game_cooldowns;
DROP POLICY IF EXISTS "game_cooldowns_service_all" ON public.game_cooldowns;

CREATE POLICY "game_cooldowns_select_own" ON public.game_cooldowns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "game_cooldowns_service_all" ON public.game_cooldowns FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Manual faucet claims policies
DROP POLICY IF EXISTS "manual_faucet_select_own" ON public.manual_faucet_claims;
DROP POLICY IF EXISTS "manual_faucet_admin_select" ON public.manual_faucet_claims;
DROP POLICY IF EXISTS "manual_faucet_service_all" ON public.manual_faucet_claims;

CREATE POLICY "manual_faucet_select_own" ON public.manual_faucet_claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "manual_faucet_admin_select" ON public.manual_faucet_claims FOR SELECT USING (public.is_admin());
CREATE POLICY "manual_faucet_service_all" ON public.manual_faucet_claims FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Fraud flags policies
DROP POLICY IF EXISTS "fraud_flags_admin_select" ON public.fraud_flags;
DROP POLICY IF EXISTS "fraud_flags_admin_all" ON public.fraud_flags;
DROP POLICY IF EXISTS "fraud_flags_service_all" ON public.fraud_flags;

CREATE POLICY "fraud_flags_admin_select" ON public.fraud_flags FOR SELECT USING (public.is_admin());
CREATE POLICY "fraud_flags_admin_all" ON public.fraud_flags FOR ALL USING (public.is_superadmin());
CREATE POLICY "fraud_flags_service_all" ON public.fraud_flags FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Audit logs policies
DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_service_insert" ON public.audit_logs;

CREATE POLICY "audit_logs_admin_select" ON public.audit_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "audit_logs_service_insert" ON public.audit_logs FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Notifications policies
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_service_all" ON public.notifications;

CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notifications_service_all" ON public.notifications FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Adblock analytics policies
DROP POLICY IF EXISTS "adblock_analytics_insert_all" ON public.adblock_analytics;
DROP POLICY IF EXISTS "adblock_analytics_admin_select" ON public.adblock_analytics;
DROP POLICY IF EXISTS "adblock_analytics_service_all" ON public.adblock_analytics;

CREATE POLICY "adblock_analytics_insert_all" ON public.adblock_analytics FOR INSERT WITH CHECK (true);
CREATE POLICY "adblock_analytics_admin_select" ON public.adblock_analytics FOR SELECT USING (public.is_admin());
CREATE POLICY "adblock_analytics_service_all" ON public.adblock_analytics FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Device fingerprints policies
DROP POLICY IF EXISTS "device_fingerprints_select_own" ON public.device_fingerprints;
DROP POLICY IF EXISTS "device_fingerprints_admin_select" ON public.device_fingerprints;
DROP POLICY IF EXISTS "device_fingerprints_service_all" ON public.device_fingerprints;

CREATE POLICY "device_fingerprints_select_own" ON public.device_fingerprints FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "device_fingerprints_admin_select" ON public.device_fingerprints FOR SELECT USING (public.is_admin());
CREATE POLICY "device_fingerprints_service_all" ON public.device_fingerprints FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- IP addresses policies
DROP POLICY IF EXISTS "ip_addresses_admin_select" ON public.ip_addresses;
DROP POLICY IF EXISTS "ip_addresses_service_all" ON public.ip_addresses;

CREATE POLICY "ip_addresses_admin_select" ON public.ip_addresses FOR SELECT USING (public.is_admin());
CREATE POLICY "ip_addresses_service_all" ON public.ip_addresses FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- SECTION 23: TRIGGERS
-- =============================================================================

-- Updated at triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_withdrawals_updated_at ON public.withdrawals;
CREATE TRIGGER update_withdrawals_updated_at BEFORE UPDATE ON public.withdrawals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tournaments_updated_at ON public.tournaments;
CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tournament_participants_updated_at ON public.tournament_participants;
CREATE TRIGGER update_tournament_participants_updated_at BEFORE UPDATE ON public.tournament_participants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fraud_flags_updated_at ON public.fraud_flags;
CREATE TRIGGER update_fraud_flags_updated_at BEFORE UPDATE ON public.fraud_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ad_settings_updated_at ON public.ad_settings;
CREATE TRIGGER update_ad_settings_updated_at BEFORE UPDATE ON public.ad_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shortlinks_updated_at ON public.shortlinks;
CREATE TRIGGER update_shortlinks_updated_at BEFORE UPDATE ON public.shortlinks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_game_cooldowns_updated_at ON public.game_cooldowns;
CREATE TRIGGER update_game_cooldowns_updated_at BEFORE UPDATE ON public.game_cooldowns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SECTION 24: AUTH TRIGGER FOR NEW USERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  ref_code TEXT;
  referrer_id UUID;
BEGIN
  LOOP
    ref_code := generate_referral_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = ref_code);
  END LOOP;
  
  IF NEW.raw_user_meta_data->>'referred_by' IS NOT NULL THEN
    SELECT id INTO referrer_id 
    FROM public.profiles 
    WHERE referral_code = NEW.raw_user_meta_data->>'referred_by';
  END IF;
  
  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    referral_code,
    referred_by,
    status
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NULL),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    ref_code,
    referrer_id,
    'active'
  );
  
  IF referrer_id IS NOT NULL THEN
    UPDATE public.profiles 
    SET referral_count = referral_count + 1 
    WHERE id = referrer_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- SECTION 25: GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT SELECT ON public.system_settings TO authenticated;
GRANT SELECT ON public.tournaments TO authenticated;
GRANT SELECT ON public.tournament_participants TO authenticated;
GRANT SELECT ON public.shortlinks TO authenticated;
GRANT SELECT ON public.coupons TO authenticated;
GRANT SELECT ON public.ad_settings TO authenticated;
GRANT SELECT ON public.ad_settings TO anon;

-- =============================================================================
-- SECTION 26: BOOSTER TIERS & USER BOOSTERS
-- (referenced by /api/boosters and admin/boosters)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.booster_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_satoshis BIGINT NOT NULL DEFAULT 0,
  faucet_bonus_percentage INTEGER NOT NULL DEFAULT 0,
  offerwall_bonus_percentage INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 7,
  badge_color TEXT DEFAULT '#22c55e',
  badge_icon TEXT DEFAULT 'zap',
  priority INTEGER DEFAULT 1,
  features JSONB DEFAULT '[]'::JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.booster_tiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS price_usd DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS price_satoshis BIGINT DEFAULT 0;
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS faucet_bonus_percentage INTEGER DEFAULT 0;
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS offerwall_bonus_percentage INTEGER DEFAULT 0;
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 7;
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS badge_color TEXT DEFAULT '#22c55e';
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS badge_icon TEXT DEFAULT 'zap';
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1;
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]';
ALTER TABLE public.booster_tiers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_booster_tiers_slug ON public.booster_tiers(slug);
CREATE INDEX IF NOT EXISTS idx_booster_tiers_active ON public.booster_tiers(is_active);

-- Seed default tiers
INSERT INTO public.booster_tiers (name, slug, description, price_usd, price_satoshis, faucet_bonus_percentage, offerwall_bonus_percentage, duration_days, badge_color, badge_icon, priority, features)
VALUES
  ('Basic',  'basic',  'Perfect for getting started.',                    5.00,  5000,  100, 10, 7,  '#22c55e', 'zap',   1, '["100% faucet claim bonus","10% offerwall bonus","7 days duration"]'),
  ('Pro',    'pro',    'Step up your game with enhanced bonuses.',        10.00, 10000, 200, 20, 15, '#3b82f6', 'flame', 2, '["200% faucet claim bonus","20% offerwall bonus","15 days duration"]'),
  ('Elite',  'elite',  'For serious earners.',                            20.00, 20000, 300, 35, 30, '#a855f7', 'crown', 3, '["300% faucet claim bonus","35% offerwall bonus","30 days duration"]'),
  ('Legend', 'legend', 'The ultimate package for legendary earners.',     50.00, 50000, 500, 50, 30, '#f59e0b', 'star',  4, '["500% faucet claim bonus","50% offerwall bonus","30 days duration","VIP support"]')
ON CONFLICT (slug) DO NOTHING;

-- RLS
DROP POLICY IF EXISTS "booster_tiers_select_all" ON public.booster_tiers;
DROP POLICY IF EXISTS "booster_tiers_admin_all" ON public.booster_tiers;
CREATE POLICY "booster_tiers_select_all" ON public.booster_tiers FOR SELECT USING (true);
CREATE POLICY "booster_tiers_admin_all" ON public.booster_tiers FOR ALL USING (public.is_superadmin());

GRANT SELECT ON public.booster_tiers TO authenticated;
GRANT SELECT ON public.booster_tiers TO anon;
GRANT ALL ON public.booster_tiers TO service_role;

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_boosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booster_tier_id UUID REFERENCES public.booster_tiers(id) ON DELETE SET NULL,
  tier TEXT,                     -- denormalised slug for fast reads
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  payment_method TEXT,
  payment_reference TEXT,
  amount_paid_usd DECIMAL(10,2) DEFAULT 0,
  amount_paid_satoshis BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_boosters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_boosters ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_boosters ADD COLUMN IF NOT EXISTS booster_tier_id UUID REFERENCES public.booster_tiers(id) ON DELETE SET NULL;
ALTER TABLE public.user_boosters ADD COLUMN IF NOT EXISTS tier TEXT;
ALTER TABLE public.user_boosters ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.user_boosters ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.user_boosters ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.user_boosters ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.user_boosters ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.user_boosters ADD COLUMN IF NOT EXISTS amount_paid_usd DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.user_boosters ADD COLUMN IF NOT EXISTS amount_paid_satoshis BIGINT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_boosters_user ON public.user_boosters(user_id);
CREATE INDEX IF NOT EXISTS idx_user_boosters_active ON public.user_boosters(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_boosters_expires ON public.user_boosters(expires_at);

DROP POLICY IF EXISTS "user_boosters_select_own" ON public.user_boosters;
DROP POLICY IF EXISTS "user_boosters_admin_all" ON public.user_boosters;
DROP POLICY IF EXISTS "user_boosters_service_all" ON public.user_boosters;
CREATE POLICY "user_boosters_select_own" ON public.user_boosters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_boosters_admin_all" ON public.user_boosters FOR ALL USING (public.is_admin());
CREATE POLICY "user_boosters_service_all" ON public.user_boosters FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON public.user_boosters TO service_role;

DROP TRIGGER IF EXISTS update_user_boosters_updated_at ON public.user_boosters;
CREATE TRIGGER update_user_boosters_updated_at BEFORE UPDATE ON public.user_boosters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.booster_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booster_tier_id UUID REFERENCES public.booster_tiers(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_reference TEXT,
  amount_usd DECIMAL(10,2) DEFAULT 0,
  amount_satoshis BIGINT DEFAULT 0,
  transaction_hash TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.booster_purchases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booster_purchases ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.booster_purchases ADD COLUMN IF NOT EXISTS booster_tier_id UUID REFERENCES public.booster_tiers(id) ON DELETE SET NULL;
ALTER TABLE public.booster_purchases ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.booster_purchases ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE public.booster_purchases ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.booster_purchases ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.booster_purchases ADD COLUMN IF NOT EXISTS amount_satoshis BIGINT DEFAULT 0;
ALTER TABLE public.booster_purchases ADD COLUMN IF NOT EXISTS transaction_hash TEXT;
ALTER TABLE public.booster_purchases ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_booster_purchases_user ON public.booster_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_booster_purchases_status ON public.booster_purchases(payment_status);

DROP POLICY IF EXISTS "booster_purchases_select_own" ON public.booster_purchases;
DROP POLICY IF EXISTS "booster_purchases_admin_all" ON public.booster_purchases;
DROP POLICY IF EXISTS "booster_purchases_service_all" ON public.booster_purchases;
CREATE POLICY "booster_purchases_select_own" ON public.booster_purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "booster_purchases_admin_all" ON public.booster_purchases FOR ALL USING (public.is_admin());
CREATE POLICY "booster_purchases_service_all" ON public.booster_purchases FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON public.booster_purchases TO service_role;

-- =============================================================================
-- SECTION 27: PTC ADS & PTC VIEWS
-- (referenced by /api/ptc/*)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ptc_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 30,
  reward_satoshis INTEGER NOT NULL DEFAULT 5 CHECK (reward_satoshis > 0),
  total_budget_satoshis BIGINT NOT NULL DEFAULT 0,
  remaining_budget_satoshis BIGINT NOT NULL DEFAULT 0,
  total_views INTEGER NOT NULL DEFAULT 0,
  total_unique_views INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  advertiser_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ptc_ads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 30;
ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS reward_satoshis INTEGER DEFAULT 5;
ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS total_budget_satoshis BIGINT DEFAULT 0;
ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS remaining_budget_satoshis BIGINT DEFAULT 0;
ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS total_views INTEGER DEFAULT 0;
ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS total_unique_views INTEGER DEFAULT 0;
ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE public.ptc_ads ADD COLUMN IF NOT EXISTS advertiser_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ptc_ads_active ON public.ptc_ads(is_active, is_approved);
CREATE INDEX IF NOT EXISTS idx_ptc_ads_budget ON public.ptc_ads(remaining_budget_satoshis);

DROP POLICY IF EXISTS "ptc_ads_select_active" ON public.ptc_ads;
DROP POLICY IF EXISTS "ptc_ads_admin_all" ON public.ptc_ads;
DROP POLICY IF EXISTS "ptc_ads_service_all" ON public.ptc_ads;
CREATE POLICY "ptc_ads_select_active" ON public.ptc_ads FOR SELECT USING (is_active = TRUE AND is_approved = TRUE OR public.is_admin());
CREATE POLICY "ptc_ads_admin_all" ON public.ptc_ads FOR ALL USING (public.is_superadmin());
CREATE POLICY "ptc_ads_service_all" ON public.ptc_ads FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

GRANT SELECT ON public.ptc_ads TO authenticated;
GRANT ALL ON public.ptc_ads TO service_role;

DROP TRIGGER IF EXISTS update_ptc_ads_updated_at ON public.ptc_ads;
CREATE TRIGGER update_ptc_ads_updated_at BEFORE UPDATE ON public.ptc_ads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ptc_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ad_id UUID NOT NULL REFERENCES public.ptc_ads(id) ON DELETE CASCADE,
  reward_satoshis INTEGER NOT NULL DEFAULT 0,
  view_duration_seconds INTEGER DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ptc_views ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ptc_views ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.ptc_views ADD COLUMN IF NOT EXISTS ad_id UUID REFERENCES public.ptc_ads(id) ON DELETE CASCADE;
ALTER TABLE public.ptc_views ADD COLUMN IF NOT EXISTS reward_satoshis INTEGER DEFAULT 0;
ALTER TABLE public.ptc_views ADD COLUMN IF NOT EXISTS view_duration_seconds INTEGER DEFAULT 0;
ALTER TABLE public.ptc_views ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.ptc_views ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.ptc_views ADD COLUMN IF NOT EXISTS ip_address TEXT;

CREATE INDEX IF NOT EXISTS idx_ptc_views_user ON public.ptc_views(user_id);
CREATE INDEX IF NOT EXISTS idx_ptc_views_ad ON public.ptc_views(ad_id);
CREATE INDEX IF NOT EXISTS idx_ptc_views_user_date ON public.ptc_views(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ptc_views_completed ON public.ptc_views(user_id, completed);

DROP POLICY IF EXISTS "ptc_views_select_own" ON public.ptc_views;
DROP POLICY IF EXISTS "ptc_views_insert_own" ON public.ptc_views;
DROP POLICY IF EXISTS "ptc_views_admin_select" ON public.ptc_views;
DROP POLICY IF EXISTS "ptc_views_service_all" ON public.ptc_views;
CREATE POLICY "ptc_views_select_own" ON public.ptc_views FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ptc_views_insert_own" ON public.ptc_views FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ptc_views_admin_select" ON public.ptc_views FOR SELECT USING (public.is_admin());
CREATE POLICY "ptc_views_service_all" ON public.ptc_views FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON public.ptc_views TO service_role;

-- =============================================================================
-- SECTION 28: SHORTLINK VIEWS
-- (referenced by /api/shortlinks/complete, /api/shortlinks/visits)
-- NOTE: replaces shortlink_claims for the "view" tracking flow
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.shortlink_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shortlink_id UUID NOT NULL REFERENCES public.shortlinks(id) ON DELETE CASCADE,
  reward_satoshis INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- code filters on viewed_at
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.shortlink_views ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shortlink_views ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.shortlink_views ADD COLUMN IF NOT EXISTS shortlink_id UUID REFERENCES public.shortlinks(id) ON DELETE CASCADE;
ALTER TABLE public.shortlink_views ADD COLUMN IF NOT EXISTS reward_satoshis INTEGER DEFAULT 0;
ALTER TABLE public.shortlink_views ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.shortlink_views ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_shortlink_views_user ON public.shortlink_views(user_id);
CREATE INDEX IF NOT EXISTS idx_shortlink_views_shortlink ON public.shortlink_views(shortlink_id);
CREATE INDEX IF NOT EXISTS idx_shortlink_views_user_date ON public.shortlink_views(user_id, viewed_at DESC);

DROP POLICY IF EXISTS "shortlink_views_select_own" ON public.shortlink_views;
DROP POLICY IF EXISTS "shortlink_views_insert_own" ON public.shortlink_views;
DROP POLICY IF EXISTS "shortlink_views_service_all" ON public.shortlink_views;
CREATE POLICY "shortlink_views_select_own" ON public.shortlink_views FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "shortlink_views_insert_own" ON public.shortlink_views FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shortlink_views_service_all" ON public.shortlink_views FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON public.shortlink_views TO service_role;

-- =============================================================================
-- SECTION 29: FAUCET SETTINGS
-- (referenced by lib/security/abuse-detection.ts)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.faucet_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crypto_symbol TEXT NOT NULL UNIQUE,
  min_reward DECIMAL(20,8) NOT NULL DEFAULT 0,
  max_reward DECIMAL(20,8) NOT NULL DEFAULT 0,
  base_reward DECIMAL(20,8) NOT NULL DEFAULT 0,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.faucet_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.faucet_settings ADD COLUMN IF NOT EXISTS crypto_symbol TEXT;
ALTER TABLE public.faucet_settings ADD COLUMN IF NOT EXISTS min_reward DECIMAL(20,8) DEFAULT 0;
ALTER TABLE public.faucet_settings ADD COLUMN IF NOT EXISTS max_reward DECIMAL(20,8) DEFAULT 0;
ALTER TABLE public.faucet_settings ADD COLUMN IF NOT EXISTS base_reward DECIMAL(20,8) DEFAULT 0;
ALTER TABLE public.faucet_settings ADD COLUMN IF NOT EXISTS cooldown_seconds INTEGER DEFAULT 300;
ALTER TABLE public.faucet_settings ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

DROP POLICY IF EXISTS "faucet_settings_select_all" ON public.faucet_settings;
DROP POLICY IF EXISTS "faucet_settings_admin_all" ON public.faucet_settings;
CREATE POLICY "faucet_settings_select_all" ON public.faucet_settings FOR SELECT USING (true);
CREATE POLICY "faucet_settings_admin_all" ON public.faucet_settings FOR ALL USING (public.is_superadmin());

GRANT SELECT ON public.faucet_settings TO authenticated;
GRANT SELECT ON public.faucet_settings TO anon;
GRANT ALL ON public.faucet_settings TO service_role;

-- =============================================================================
-- SECTION 30: SECURITY / FRAUD TABLES
-- (referenced by lib/security/abuse-detection.ts and anti-drain-protection.ts)
-- =============================================================================

-- Login history – tracks sign-in geography for abuse detection
CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip_address TEXT,
  country TEXT,
  city TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.login_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.login_history ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.login_history ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.login_history ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.login_history ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_login_history_user ON public.login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_created ON public.login_history(created_at DESC);

DROP POLICY IF EXISTS "login_history_select_own" ON public.login_history;
DROP POLICY IF EXISTS "login_history_admin_select" ON public.login_history;
DROP POLICY IF EXISTS "login_history_service_all" ON public.login_history;
CREATE POLICY "login_history_select_own" ON public.login_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "login_history_admin_select" ON public.login_history FOR SELECT USING (public.is_admin());
CREATE POLICY "login_history_service_all" ON public.login_history FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON public.login_history TO service_role;

-- -------------------------------------------------------

-- Blocked IPs – checked by anti-drain-protection.ts before every claim
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  blocked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON public.blocked_ips(ip_address);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_active ON public.blocked_ips(is_active) WHERE is_active = TRUE;

DROP POLICY IF EXISTS "blocked_ips_admin_all" ON public.blocked_ips;
DROP POLICY IF EXISTS "blocked_ips_service_all" ON public.blocked_ips;
CREATE POLICY "blocked_ips_admin_all" ON public.blocked_ips FOR ALL USING (public.is_superadmin());
CREATE POLICY "blocked_ips_service_all" ON public.blocked_ips FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON public.blocked_ips TO service_role;

-- -------------------------------------------------------

-- Fraud attempts – inserted by anti-drain-protection.ts on suspicious activity
CREATE TABLE IF NOT EXISTS public.fraud_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  fingerprint TEXT,
  risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  suspicious_factors JSONB DEFAULT '[]',
  crypto_symbol TEXT,
  request_headers JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fraud_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fraud_attempts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.fraud_attempts ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.fraud_attempts ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.fraud_attempts ADD COLUMN IF NOT EXISTS fingerprint TEXT;
ALTER TABLE public.fraud_attempts ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
ALTER TABLE public.fraud_attempts ADD COLUMN IF NOT EXISTS suspicious_factors JSONB DEFAULT '[]';
ALTER TABLE public.fraud_attempts ADD COLUMN IF NOT EXISTS crypto_symbol TEXT;
ALTER TABLE public.fraud_attempts ADD COLUMN IF NOT EXISTS request_headers JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_fraud_attempts_user ON public.fraud_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_attempts_ip ON public.fraud_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_fraud_attempts_created ON public.fraud_attempts(created_at DESC);

DROP POLICY IF EXISTS "fraud_attempts_admin_select" ON public.fraud_attempts;
DROP POLICY IF EXISTS "fraud_attempts_service_all" ON public.fraud_attempts;
CREATE POLICY "fraud_attempts_admin_select" ON public.fraud_attempts FOR SELECT USING (public.is_admin());
CREATE POLICY "fraud_attempts_service_all" ON public.fraud_attempts FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON public.fraud_attempts TO service_role;

-- -------------------------------------------------------

-- Sessions – queried by referral-fraud-detector.ts to detect IP overlap between referrer/referee
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip_address TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON public.sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_ip ON public.sessions(ip_address);

DROP POLICY IF EXISTS "sessions_select_own" ON public.sessions;
DROP POLICY IF EXISTS "sessions_admin_select" ON public.sessions;
DROP POLICY IF EXISTS "sessions_service_all" ON public.sessions;
CREATE POLICY "sessions_select_own" ON public.sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sessions_admin_select" ON public.sessions FOR SELECT USING (public.is_admin());
CREATE POLICY "sessions_service_all" ON public.sessions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON public.sessions TO service_role;

-- =============================================================================
-- DONE! Database is fully set up.
-- =============================================================================

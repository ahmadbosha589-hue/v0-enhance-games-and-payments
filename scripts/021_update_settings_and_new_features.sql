-- =====================================================
-- Script 021: Update Settings and Add New Features
-- Offerwalls, PTC (Paid-to-Click), Achievements
-- FIXED VERSION
-- =====================================================

-- Enable required extension first
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- Update/Insert faucet settings (fixed order)
-- =====================================================
-- Use INSERT with ON CONFLICT instead of UPDATE first
INSERT INTO public.system_settings (key, value, description) VALUES
  ('minimum_withdrawal_satoshis', '1000', 'Minimum withdrawal amount in satoshis'),
  ('daily_withdrawal_limit_satoshis', '25000', 'Daily withdrawal limit per user in satoshis'),
  ('base_claim_amount_satoshis', '7', 'Base claim amount per faucet claim'),
  ('max_claim_amount_satoshis', '100', 'Maximum claim amount with bonuses')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description;

-- =====================================================
-- Offerwall Providers Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.offerwall_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  api_key TEXT,
  secret_key TEXT,
  postback_url TEXT,
  is_enabled BOOLEAN DEFAULT true,
  conversion_rate NUMERIC(10, 4) DEFAULT 1.0, -- Changed from DECIMAL to NUMERIC
  min_payout_satoshis BIGINT DEFAULT 1,
  total_conversions INTEGER DEFAULT 0,
  total_paid_satoshis BIGINT DEFAULT 0,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- Offerwall Conversions Table (completed offers)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.offerwall_conversions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.offerwall_providers(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  offer_name TEXT,
  payout_credits NUMERIC(10, 4) NOT NULL, -- Changed from DECIMAL to NUMERIC
  payout_satoshis BIGINT NOT NULL,
  transaction_id TEXT UNIQUE,
  ip_address INET,
  user_agent TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'reversed')),
  processed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- PTC Ads Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ptc_ads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  advertiser_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  image_url TEXT,
  duration_seconds INTEGER DEFAULT 10 CHECK (duration_seconds >= 5 AND duration_seconds <= 60),
  reward_satoshis BIGINT NOT NULL CHECK (reward_satoshis > 0),
  total_budget_satoshis BIGINT NOT NULL CHECK (total_budget_satoshis > 0),
  remaining_budget_satoshis BIGINT NOT NULL CHECK (remaining_budget_satoshis >= 0),
  max_views_per_user INTEGER DEFAULT 1 CHECK (max_views_per_user > 0),
  total_views INTEGER DEFAULT 0 CHECK (total_views >= 0),
  total_unique_views INTEGER DEFAULT 0 CHECK (total_unique_views >= 0),
  is_active BOOLEAN DEFAULT true,
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  target_countries TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT ptc_ads_budget_check CHECK (remaining_budget_satoshis <= total_budget_satoshis),
  CONSTRAINT ptc_ads_date_check CHECK (end_date IS NULL OR end_date > start_date)
);

-- =====================================================
-- PTC Views Table (track ad views)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ptc_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ad_id UUID NOT NULL REFERENCES public.ptc_ads(id) ON DELETE CASCADE,
  reward_satoshis BIGINT NOT NULL CHECK (reward_satoshis > 0),
  view_duration_seconds INTEGER CHECK (view_duration_seconds >= 0),
  completed BOOLEAN DEFAULT false,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ
);

-- Create unique index for one view per user per ad per day (fixed)
-- Using date_trunc which is IMMUTABLE and works with timezones
CREATE UNIQUE INDEX IF NOT EXISTS idx_ptc_views_user_ad_date 
ON public.ptc_views (user_id, ad_id, date_trunc('day', created_at AT TIME ZONE 'UTC'));

-- =====================================================
-- Achievements Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT DEFAULT 'trophy',
  category TEXT NOT NULL CHECK (category IN ('claims', 'earnings', 'referrals', 'streak', 'withdrawals', 'offerwalls', 'ptc', 'special')),
  requirement_type TEXT NOT NULL CHECK (requirement_type IN ('count', 'amount', 'streak', 'single')),
  requirement_value BIGINT NOT NULL CHECK (requirement_value > 0),
  reward_satoshis BIGINT NOT NULL DEFAULT 0 CHECK (reward_satoshis >= 0),
  xp_reward INTEGER DEFAULT 0 CHECK (xp_reward >= 0),
  badge_color TEXT DEFAULT 'gold',
  is_hidden BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- User Achievements Table (earned achievements)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  progress BIGINT DEFAULT 0 CHECK (progress >= 0),
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  reward_claimed BOOLEAN DEFAULT false,
  reward_claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, achievement_id),
  CONSTRAINT user_achievements_completion_check CHECK (
    (completed = false AND completed_at IS NULL) OR
    (completed = true AND completed_at IS NOT NULL)
  ),
  CONSTRAINT user_achievements_claim_check CHECK (
    (reward_claimed = false AND reward_claimed_at IS NULL) OR
    (reward_claimed = true AND reward_claimed_at IS NOT NULL AND completed = true)
  )
);

-- =====================================================
-- Enable RLS on new tables
-- =====================================================
ALTER TABLE public.offerwall_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offerwall_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ptc_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ptc_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Drop existing policies if they exist (for re-runability)
-- =====================================================
DO $$ 
BEGIN
  -- Offerwall Providers policies
  DROP POLICY IF EXISTS offerwall_providers_select ON public.offerwall_providers;
  DROP POLICY IF EXISTS offerwall_providers_admin ON public.offerwall_providers;
  
  -- Offerwall Conversions policies
  DROP POLICY IF EXISTS offerwall_conversions_select ON public.offerwall_conversions;
  DROP POLICY IF EXISTS offerwall_conversions_insert ON public.offerwall_conversions;
  
  -- PTC Ads policies
  DROP POLICY IF EXISTS ptc_ads_select ON public.ptc_ads;
  DROP POLICY IF EXISTS ptc_ads_admin ON public.ptc_ads;
  
  -- PTC Views policies
  DROP POLICY IF EXISTS ptc_views_select ON public.ptc_views;
  DROP POLICY IF EXISTS ptc_views_insert ON public.ptc_views;
  DROP POLICY IF EXISTS ptc_views_update ON public.ptc_views;
  
  -- Achievements policies
  DROP POLICY IF EXISTS achievements_select ON public.achievements;
  DROP POLICY IF EXISTS achievements_admin ON public.achievements;
  
  -- User Achievements policies
  DROP POLICY IF EXISTS user_achievements_select ON public.user_achievements;
  DROP POLICY IF EXISTS user_achievements_insert ON public.user_achievements;
  DROP POLICY IF EXISTS user_achievements_update ON public.user_achievements;
END $$;

-- =====================================================
-- Create RLS Policies
-- =====================================================

-- Offerwall Providers - Public read enabled providers, admin write
CREATE POLICY offerwall_providers_select ON public.offerwall_providers 
FOR SELECT USING (is_enabled = true OR EXISTS (
  SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
));

CREATE POLICY offerwall_providers_admin ON public.offerwall_providers 
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

-- Offerwall Conversions - Users see own, staff see all
CREATE POLICY offerwall_conversions_select ON public.offerwall_conversions 
FOR SELECT USING (
  user_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'moderator'))
);

CREATE POLICY offerwall_conversions_insert ON public.offerwall_conversions 
FOR INSERT WITH CHECK (user_id = auth.uid());

-- PTC Ads - Public read active/approved, admin write
CREATE POLICY ptc_ads_select ON public.ptc_ads 
FOR SELECT USING (
  (is_active = true AND is_approved = true AND 
   remaining_budget_satoshis > 0 AND
   (end_date IS NULL OR end_date > NOW())) OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

CREATE POLICY ptc_ads_admin ON public.ptc_ads 
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

-- PTC Views - Users see and manage own
CREATE POLICY ptc_views_select ON public.ptc_views 
FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'moderator'))
);

CREATE POLICY ptc_views_insert ON public.ptc_views 
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY ptc_views_update ON public.ptc_views 
FOR UPDATE USING (user_id = auth.uid()) 
WITH CHECK (user_id = auth.uid());

-- Achievements - Public read active, admin write
CREATE POLICY achievements_select ON public.achievements 
FOR SELECT USING (
  is_active = true OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

CREATE POLICY achievements_admin ON public.achievements 
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

-- User Achievements - Users see and manage own
CREATE POLICY user_achievements_select ON public.user_achievements 
FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

CREATE POLICY user_achievements_insert ON public.user_achievements 
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY user_achievements_update ON public.user_achievements 
FOR UPDATE USING (user_id = auth.uid()) 
WITH CHECK (user_id = auth.uid());

-- =====================================================
-- Insert default offerwall providers
-- =====================================================
INSERT INTO public.offerwall_providers (name, slug, description, logo_url, conversion_rate, is_enabled) VALUES
  ('CPX Research', 'cpx-research', 'Complete surveys and earn satoshis. High-paying surveys from top brands.', '/images/offerwalls/cpx-research.png', 1.0, true),
  ('Torox', 'torox', 'Complete offers, download apps, and watch videos to earn rewards.', '/images/offerwalls/torox.png', 1.0, true),
  ('Lootably', 'lootably', 'Premium offerwall with high-converting offers and fast payouts.', '/images/offerwalls/lootably.png', 1.0, true),
  ('AdGate Media', 'adgate', 'Trusted offerwall with thousands of offers worldwide.', '/images/offerwalls/adgate.png', 1.0, true),
  ('MM Wall', 'mm-wall', 'MakeMoney Wall - Complete simple tasks and earn instantly.', '/images/offerwalls/mm-wall.png', 1.0, true),
  ('Timewall', 'timewall', 'Watch videos and complete tasks to earn rewards over time.', '/images/offerwalls/timewall.png', 1.0, true),
  ('OfferToro', 'offertoro', 'Complete offers from top advertisers and earn crypto.', '/images/offerwalls/offertoro.png', 1.0, true),
  ('AdscendMedia', 'adscend', 'Premium offers with high payouts and reliable tracking.', '/images/offerwalls/adscend.png', 1.0, true)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- Insert default achievements
-- =====================================================
INSERT INTO public.achievements (slug, name, description, icon, category, requirement_type, requirement_value, reward_satoshis, xp_reward, badge_color, sort_order) VALUES
  -- Claims achievements
  ('first_claim', 'First Steps', 'Make your first faucet claim', 'zap', 'claims', 'count', 1, 10, 10, 'bronze', 1),
  ('claims_10', 'Getting Started', 'Complete 10 faucet claims', 'zap', 'claims', 'count', 10, 25, 25, 'bronze', 2),
  ('claims_50', 'Regular Claimer', 'Complete 50 faucet claims', 'zap', 'claims', 'count', 50, 100, 50, 'silver', 3),
  ('claims_100', 'Dedicated Farmer', 'Complete 100 faucet claims', 'zap', 'claims', 'count', 100, 250, 100, 'silver', 4),
  ('claims_500', 'Faucet Master', 'Complete 500 faucet claims', 'zap', 'claims', 'count', 500, 1000, 250, 'gold', 5),
  ('claims_1000', 'Faucet Legend', 'Complete 1,000 faucet claims', 'crown', 'claims', 'count', 1000, 5000, 500, 'platinum', 6),
  
  -- Streak achievements
  ('streak_3', 'Warming Up', 'Achieve a 3-day claim streak', 'flame', 'streak', 'streak', 3, 15, 15, 'bronze', 10),
  ('streak_7', 'Week Warrior', 'Achieve a 7-day claim streak', 'flame', 'streak', 'streak', 7, 50, 50, 'silver', 11),
  ('streak_14', 'Two Week Champion', 'Achieve a 14-day claim streak', 'flame', 'streak', 'streak', 14, 150, 100, 'silver', 12),
  ('streak_30', 'Monthly Master', 'Achieve a 30-day claim streak', 'flame', 'streak', 'streak', 30, 500, 250, 'gold', 13),
  ('streak_100', 'Streak Legend', 'Achieve a 100-day claim streak', 'fire', 'streak', 'streak', 100, 2500, 500, 'platinum', 14),
  
  -- Earnings achievements
  ('earn_1k', 'First Thousand', 'Earn 1,000 satoshis total', 'coins', 'earnings', 'amount', 1000, 50, 25, 'bronze', 20),
  ('earn_10k', 'Stacking Sats', 'Earn 10,000 satoshis total', 'coins', 'earnings', 'amount', 10000, 200, 100, 'silver', 21),
  ('earn_100k', 'Serious Stacker', 'Earn 100,000 satoshis total', 'coins', 'earnings', 'amount', 100000, 1000, 250, 'gold', 22),
  ('earn_1m', 'Satoshi Millionaire', 'Earn 1,000,000 satoshis total', 'gem', 'earnings', 'amount', 1000000, 10000, 1000, 'platinum', 23),
  
  -- Referral achievements
  ('refer_1', 'Social Butterfly', 'Refer your first friend', 'users', 'referrals', 'count', 1, 25, 25, 'bronze', 30),
  ('refer_5', 'Team Builder', 'Refer 5 friends', 'users', 'referrals', 'count', 5, 100, 75, 'silver', 31),
  ('refer_25', 'Network King', 'Refer 25 friends', 'users', 'referrals', 'count', 25, 500, 250, 'gold', 32),
  ('refer_100', 'Influencer', 'Refer 100 friends', 'star', 'referrals', 'count', 100, 2500, 500, 'platinum', 33),
  
  -- Withdrawal achievements
  ('first_withdraw', 'Cash Out', 'Make your first withdrawal', 'wallet', 'withdrawals', 'single', 1, 25, 25, 'bronze', 40),
  ('withdraw_5', 'Regular Withdrawer', 'Complete 5 withdrawals', 'wallet', 'withdrawals', 'count', 5, 100, 75, 'silver', 41),
  ('withdraw_25', 'Withdrawal Pro', 'Complete 25 withdrawals', 'wallet', 'withdrawals', 'count', 25, 500, 200, 'gold', 42),
  
  -- Offerwall achievements
  ('first_offer', 'Offer Explorer', 'Complete your first offerwall task', 'gift', 'offerwalls', 'count', 1, 50, 25, 'bronze', 50),
  ('offers_10', 'Offer Hunter', 'Complete 10 offerwall tasks', 'gift', 'offerwalls', 'count', 10, 200, 100, 'silver', 51),
  ('offers_50', 'Offer Master', 'Complete 50 offerwall tasks', 'gift', 'offerwalls', 'count', 50, 1000, 300, 'gold', 52),
  
  -- PTC achievements
  ('first_ptc', 'Ad Viewer', 'Watch your first PTC ad', 'play', 'ptc', 'count', 1, 10, 10, 'bronze', 60),
  ('ptc_50', 'Ad Enthusiast', 'Watch 50 PTC ads', 'play', 'ptc', 'count', 50, 100, 75, 'silver', 61),
  ('ptc_200', 'Ad Professional', 'Watch 200 PTC ads', 'play', 'ptc', 'count', 200, 500, 200, 'gold', 62),
  
  -- Special achievements
  ('early_adopter', 'Early Adopter', 'Join during the first month of launch', 'rocket', 'special', 'single', 1, 500, 250, 'special', 70),
  ('night_owl', 'Night Owl', 'Claim between 2 AM and 5 AM', 'moon', 'special', 'single', 1, 25, 25, 'special', 71),
  ('weekend_warrior', 'Weekend Warrior', 'Claim on both Saturday and Sunday', 'calendar', 'special', 'single', 1, 50, 50, 'special', 72)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- Create/Replace withdrawal function with new limits
-- =====================================================
CREATE OR REPLACE FUNCTION atomic_withdraw(
  p_user_id UUID,
  p_amount BIGINT,
  p_payment_method TEXT,
  p_payment_address TEXT,
  p_payment_currency TEXT DEFAULT 'BTC',
  p_idempotency_key TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id BIGINT;
  v_profile profiles%ROWTYPE;
  v_fee BIGINT;
  v_net_amount BIGINT;
  v_withdrawal_id UUID;
  v_transaction_id UUID;
  v_pending_count INTEGER;
  v_daily_withdrawn BIGINT;
  v_min_withdrawal BIGINT;
  v_max_daily BIGINT;
  v_fee_rate NUMERIC := 0.0; -- 0% fee
  v_fraud_score INTEGER := 0;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_USER_ID');
  END IF;
  
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;
  
  IF p_payment_method IS NULL OR p_payment_address IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PAYMENT_INFO');
  END IF;

  -- Get settings from database with defaults
  SELECT COALESCE((value::TEXT)::BIGINT, 1000) INTO v_min_withdrawal 
  FROM public.system_settings WHERE key = 'minimum_withdrawal_satoshis';
  
  SELECT COALESCE((value::TEXT)::BIGINT, 25000) INTO v_max_daily 
  FROM public.system_settings WHERE key = 'daily_withdrawal_limit_satoshis';

  -- Generate lock ID from user_id
  v_lock_id := ('x' || substr(md5(p_user_id::text || 'withdraw'), 1, 15))::bit(60)::bigint;
  
  -- Acquire advisory lock (automatically released at transaction end)
  IF NOT pg_try_advisory_xact_lock(v_lock_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'WITHDRAWAL_IN_PROGRESS',
      'message', 'Another withdrawal is being processed. Please wait.'
    );
  END IF;
  
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_withdrawal_id FROM withdrawals 
    WHERE idempotency_key = p_idempotency_key AND user_id = p_user_id
    LIMIT 1;
    
    IF v_withdrawal_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'DUPLICATE_WITHDRAWAL',
        'message', 'This withdrawal has already been submitted',
        'withdrawal_id', v_withdrawal_id
      );
    END IF;
  END IF;
  
  -- Get profile with row lock
  SELECT * INTO v_profile FROM profiles 
  WHERE id = p_user_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;
  
  IF v_profile.status = 'banned' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'USER_BANNED',
      'message', 'Your account has been banned'
    );
  END IF;
  
  -- Validate minimum amount
  IF p_amount < v_min_withdrawal THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AMOUNT_TOO_LOW',
      'message', 'Minimum withdrawal is ' || v_min_withdrawal || ' satoshis',
      'minimum', v_min_withdrawal
    );
  END IF;
  
  -- Check sufficient balance
  IF p_amount > v_profile.balance_satoshis THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_BALANCE',
      'message', 'Insufficient balance',
      'balance', v_profile.balance_satoshis,
      'requested', p_amount
    );
  END IF;
  
  -- Check pending withdrawals limit
  SELECT COUNT(*) INTO v_pending_count 
  FROM withdrawals 
  WHERE user_id = p_user_id 
    AND status IN ('pending', 'processing');
  
  IF v_pending_count >= 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TOO_MANY_PENDING',
      'message', 'You have too many pending withdrawals. Please wait for them to be processed.',
      'pending_count', v_pending_count
    );
  END IF;
  
  -- Check daily limit
  SELECT COALESCE(SUM(amount_satoshis), 0) INTO v_daily_withdrawn
  FROM withdrawals 
  WHERE user_id = p_user_id 
    AND created_at > NOW() - INTERVAL '24 hours'
    AND status IN ('pending', 'processing', 'completed');
  
  IF v_daily_withdrawn + p_amount > v_max_daily THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DAILY_LIMIT_EXCEEDED',
      'message', 'Daily withdrawal limit exceeded',
      'daily_limit', v_max_daily,
      'already_withdrawn', v_daily_withdrawn,
      'available', v_max_daily - v_daily_withdrawn
    );
  END IF;
  
  -- Calculate fee (0% by default)
  v_fee := CEIL(p_amount * v_fee_rate);
  v_net_amount := p_amount - v_fee;
  
  -- Calculate fraud score
  v_fraud_score := COALESCE(v_profile.fraud_score, 0);
  
  -- Increase fraud score for suspicious patterns
  IF v_profile.total_claims < 10 THEN
    v_fraud_score := v_fraud_score + 20;
  END IF;
  
  IF p_amount > COALESCE(v_profile.total_earned_satoshis, 0) * 0.5 THEN
    v_fraud_score := v_fraud_score + 15;
  END IF;
  
  IF v_profile.created_at > NOW() - INTERVAL '7 days' THEN
    v_fraud_score := v_fraud_score + 10;
  END IF;
  
  -- Create withdrawal record
  INSERT INTO withdrawals (
    user_id, amount_satoshis, fee_satoshis, net_amount_satoshis,
    payment_method, payment_address, payment_currency,
    status, idempotency_key, fraud_score, is_flagged, ip_address
  ) VALUES (
    p_user_id, p_amount, v_fee, v_net_amount,
    p_payment_method, p_payment_address, p_payment_currency,
    'pending', p_idempotency_key, v_fraud_score, v_fraud_score > 70, p_ip_address
  ) RETURNING id INTO v_withdrawal_id;
  
  -- Deduct from user balance
  UPDATE profiles SET
    balance_satoshis = balance_satoshis - p_amount,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Create transaction record
  INSERT INTO transactions (
    user_id, type, amount_satoshis,
    balance_before, balance_after,
    withdrawal_id, status, idempotency_key,
    description, ip_address
  ) VALUES (
    p_user_id, 'withdrawal', -p_amount,
    v_profile.balance_satoshis, v_profile.balance_satoshis - p_amount,
    v_withdrawal_id, 'pending', p_idempotency_key,
    'Withdrawal to ' || p_payment_method || ' (' || p_payment_currency || ')',
    p_ip_address
  ) RETURNING id INTO v_transaction_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'transaction_id', v_transaction_id,
    'amount', p_amount,
    'fee', v_fee,
    'net_amount', v_net_amount,
    'new_balance', v_profile.balance_satoshis - p_amount,
    'status', 'pending',
    'flagged', v_fraud_score > 70,
    'fraud_score', v_fraud_score
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return failure
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INTERNAL_ERROR',
      'message', 'An error occurred while processing your withdrawal',
      'details', SQLERRM
    );
END;
$$;

-- =====================================================
-- Performance Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_offerwall_conversions_user 
ON public.offerwall_conversions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offerwall_conversions_provider 
ON public.offerwall_conversions(provider_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offerwall_conversions_status 
ON public.offerwall_conversions(status, created_at DESC) 
WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_ptc_views_user 
ON public.ptc_views(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ptc_views_ad 
ON public.ptc_views(ad_id, completed, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ptc_ads_active 
ON public.ptc_ads(is_active, is_approved, remaining_budget_satoshis) 
WHERE is_active = true AND is_approved = true AND remaining_budget_satoshis > 0;

CREATE INDEX IF NOT EXISTS idx_ptc_ads_dates 
ON public.ptc_ads(start_date, end_date) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_achievements_user 
ON public.user_achievements(user_id, completed, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement 
ON public.user_achievements(achievement_id, completed);

CREATE INDEX IF NOT EXISTS idx_achievements_category 
ON public.achievements(category, is_active, sort_order) 
WHERE is_active = true;

-- =====================================================
-- Create trigger for updating updated_at timestamps
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_offerwall_providers_updated_at') THEN
    CREATE TRIGGER update_offerwall_providers_updated_at
      BEFORE UPDATE ON public.offerwall_providers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ptc_ads_updated_at') THEN
    CREATE TRIGGER update_ptc_ads_updated_at
      BEFORE UPDATE ON public.ptc_ads
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =====================================================
-- Grant necessary permissions
-- =====================================================
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT ON public.offerwall_providers TO authenticated, anon;
GRANT SELECT ON public.achievements TO authenticated, anon;
GRANT SELECT ON public.ptc_ads TO authenticated, anon;

-- =====================================================
-- Final verification query (comment out in production)
-- =====================================================
-- SELECT 
--   'offerwall_providers' as table_name, COUNT(*) as record_count 
-- FROM public.offerwall_providers
-- UNION ALL
-- SELECT 'achievements', COUNT(*) FROM public.achievements
-- UNION ALL
-- SELECT 'ptc_ads', COUNT(*) FROM public.ptc_ads;

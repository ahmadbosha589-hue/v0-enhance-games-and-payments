-- =====================================================
-- COUPONS AND SHORTLINKS TABLES
-- =====================================================

-- Coupons table for promo codes
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  reward_satoshis INTEGER NOT NULL DEFAULT 10,
  max_uses INTEGER DEFAULT NULL, -- NULL means unlimited
  current_uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- User coupon redemptions tracking
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  reward_satoshis INTEGER NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  UNIQUE(user_id, coupon_id) -- One redemption per user per coupon
);

-- Shortlinks table
CREATE TABLE IF NOT EXISTS public.shortlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  reward_satoshis INTEGER NOT NULL DEFAULT 2,
  view_time_seconds INTEGER NOT NULL DEFAULT 10, -- Time user must wait
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_views INTEGER NOT NULL DEFAULT 0
);

-- User shortlink views tracking
CREATE TABLE IF NOT EXISTS public.shortlink_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shortlink_id UUID NOT NULL REFERENCES public.shortlinks(id) ON DELETE CASCADE,
  reward_satoshis INTEGER NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT
);

-- Daily limit for shortlinks (max 50 per day)
CREATE TABLE IF NOT EXISTS public.shortlink_daily_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  views_count INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Enable RLS on all tables
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortlink_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortlink_daily_limits ENABLE ROW LEVEL SECURITY;

-- Coupons policies (public read for active coupons)
DO $$ BEGIN
  CREATE POLICY "coupons_select_active" ON public.coupons 
    FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Coupon redemptions policies
DO $$ BEGIN
  CREATE POLICY "coupon_redemptions_select_own" ON public.coupon_redemptions 
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "coupon_redemptions_insert_own" ON public.coupon_redemptions 
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Shortlinks policies (public read for active)
DO $$ BEGIN
  CREATE POLICY "shortlinks_select_active" ON public.shortlinks 
    FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Shortlink views policies
DO $$ BEGIN
  CREATE POLICY "shortlink_views_select_own" ON public.shortlink_views 
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "shortlink_views_insert_own" ON public.shortlink_views 
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Shortlink daily limits policies
DO $$ BEGIN
  CREATE POLICY "shortlink_daily_limits_select_own" ON public.shortlink_daily_limits 
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "shortlink_daily_limits_insert_own" ON public.shortlink_daily_limits 
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "shortlink_daily_limits_update_own" ON public.shortlink_daily_limits 
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Insert some default coupons
INSERT INTO public.coupons (code, reward_satoshis, max_uses, is_active) VALUES
  ('WELCOME2024', 50, 1000, true),
  ('BONUS100', 100, 500, true),
  ('FREESATS', 25, NULL, true)
ON CONFLICT (code) DO NOTHING;

-- Insert some default shortlinks
INSERT INTO public.shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active) VALUES
  ('Bitcoin News', 'https://bitcoin.org', 2, 10, true),
  ('Crypto Guide', 'https://ethereum.org', 3, 15, true),
  ('Blockchain 101', 'https://blockchain.com', 2, 10, true),
  ('DeFi Explained', 'https://defipulse.com', 3, 15, true),
  ('NFT Marketplace', 'https://opensea.io', 2, 12, true)
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user_id ON public.coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_id ON public.coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_shortlink_views_user_id ON public.shortlink_views(user_id);
CREATE INDEX IF NOT EXISTS idx_shortlink_views_shortlink_id ON public.shortlink_views(shortlink_id);
CREATE INDEX IF NOT EXISTS idx_shortlink_daily_limits_user_date ON public.shortlink_daily_limits(user_id, date);

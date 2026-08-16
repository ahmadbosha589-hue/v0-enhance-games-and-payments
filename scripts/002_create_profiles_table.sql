-- Crypto Faucet Platform - Database Schema
-- Script 002: Create profiles table (extends auth.users)

CREATE TABLE IF NOT EXISTS public.profiles (
  -- Primary key references auth.users
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Basic info
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  
  -- Role and status
  role user_role DEFAULT 'user' NOT NULL,
  status account_status DEFAULT 'pending_verification' NOT NULL,
  
  -- Balances (stored in satoshis for precision)
  balance_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (balance_satoshis >= 0),
  total_earned_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (total_earned_satoshis >= 0),
  total_withdrawn_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (total_withdrawn_satoshis >= 0),
  
  -- Referral system
  referral_code TEXT UNIQUE NOT NULL,
  referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  referral_count INTEGER DEFAULT 0 NOT NULL CHECK (referral_count >= 0),
  referral_earnings_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (referral_earnings_satoshis >= 0),
  
  -- Claim tracking
  last_claim_at TIMESTAMPTZ,
  total_claims INTEGER DEFAULT 0 NOT NULL CHECK (total_claims >= 0),
  claim_streak INTEGER DEFAULT 0 NOT NULL CHECK (claim_streak >= 0),
  max_claim_streak INTEGER DEFAULT 0 NOT NULL CHECK (max_claim_streak >= 0),
  
  -- Security
  two_factor_enabled BOOLEAN DEFAULT FALSE NOT NULL,
  two_factor_secret TEXT,
  
  -- Fraud detection
  fraud_score INTEGER DEFAULT 0 NOT NULL CHECK (fraud_score >= 0 AND fraud_score <= 100),
  is_flagged BOOLEAN DEFAULT FALSE NOT NULL,
  
  -- FaucetPay integration
  faucetpay_email TEXT,
  faucetpay_verified BOOLEAN DEFAULT FALSE NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_active_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  banned_at TIMESTAMPTZ,
  banned_reason TEXT
);

-- Create indexes for performance
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_referral_code ON public.profiles(referral_code);
CREATE INDEX idx_profiles_referred_by ON public.profiles(referred_by);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_status ON public.profiles(status);
CREATE INDEX idx_profiles_fraud_score ON public.profiles(fraud_score);
CREATE INDEX idx_profiles_is_flagged ON public.profiles(is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX idx_profiles_created_at ON public.profiles(created_at);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile (limited fields)
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow insert for new users (handled by trigger)
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "profiles_admin_select" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin', 'moderator')
    )
  );

-- Admins can update all profiles
CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );

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

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  ref_code TEXT;
  referrer_id UUID;
BEGIN
  -- Generate unique referral code
  LOOP
    ref_code := generate_referral_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = ref_code);
  END LOOP;
  
  -- Check if referred by someone
  IF NEW.raw_user_meta_data->>'referred_by' IS NOT NULL THEN
    SELECT id INTO referrer_id 
    FROM public.profiles 
    WHERE referral_code = NEW.raw_user_meta_data->>'referred_by';
  END IF;
  
  -- Insert profile
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
  
  -- Update referrer's count if applicable
  IF referrer_id IS NOT NULL THEN
    UPDATE public.profiles 
    SET referral_count = referral_count + 1 
    WHERE id = referrer_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

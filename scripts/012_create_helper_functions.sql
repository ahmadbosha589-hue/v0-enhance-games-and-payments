-- Crypto Faucet Platform - Database Schema
-- Script 012: Create helper functions

-- Function to check if user can claim
CREATE OR REPLACE FUNCTION can_user_claim(p_user_id UUID)
RETURNS TABLE (
  can_claim BOOLEAN,
  seconds_until_claim INTEGER,
  reason TEXT
) AS $$
DECLARE
  v_last_claim TIMESTAMPTZ;
  v_cooldown INTEGER;
  v_status account_status;
  v_is_flagged BOOLEAN;
  v_seconds_left INTEGER;
BEGIN
  -- Get cooldown setting
  SELECT (value::TEXT)::INTEGER INTO v_cooldown 
  FROM public.system_settings 
  WHERE key = 'claim_cooldown_seconds';
  
  -- Get user info
  SELECT p.last_claim_at, p.status, p.is_flagged 
  INTO v_last_claim, v_status, v_is_flagged
  FROM public.profiles p
  WHERE p.id = p_user_id;
  
  -- Check if user exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 'User not found'::TEXT;
    RETURN;
  END IF;
  
  -- Check if user is active
  IF v_status != 'active' THEN
    RETURN QUERY SELECT FALSE, 0, ('Account is ' || v_status::TEXT)::TEXT;
    RETURN;
  END IF;
  
  -- Check if flagged
  IF v_is_flagged THEN
    RETURN QUERY SELECT FALSE, 0, 'Account is under review'::TEXT;
    RETURN;
  END IF;
  
  -- Check cooldown
  IF v_last_claim IS NOT NULL THEN
    v_seconds_left := GREATEST(0, v_cooldown - EXTRACT(EPOCH FROM (NOW() - v_last_claim))::INTEGER);
    IF v_seconds_left > 0 THEN
      RETURN QUERY SELECT FALSE, v_seconds_left, 'Cooldown active'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  RETURN QUERY SELECT TRUE, 0, 'Ready to claim'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate claim amount
CREATE OR REPLACE FUNCTION calculate_claim_amount(p_user_id UUID)
RETURNS TABLE (
  base_amount BIGINT,
  streak_bonus BIGINT,
  total_amount BIGINT,
  current_streak INTEGER
) AS $$
DECLARE
  v_base_amount BIGINT;
  v_max_amount BIGINT;
  v_streak_bonus_pct INTEGER;
  v_max_streak_bonus_pct INTEGER;
  v_streak INTEGER;
  v_streak_bonus BIGINT;
  v_total BIGINT;
BEGIN
  -- Get settings
  SELECT (value::TEXT)::BIGINT INTO v_base_amount 
  FROM public.system_settings WHERE key = 'base_claim_amount_satoshis';
  
  SELECT (value::TEXT)::BIGINT INTO v_max_amount 
  FROM public.system_settings WHERE key = 'max_claim_amount_satoshis';
  
  SELECT (value::TEXT)::INTEGER INTO v_streak_bonus_pct 
  FROM public.system_settings WHERE key = 'streak_bonus_percentage';
  
  SELECT (value::TEXT)::INTEGER INTO v_max_streak_bonus_pct 
  FROM public.system_settings WHERE key = 'max_streak_bonus_percentage';
  
  -- Get user streak
  SELECT claim_streak INTO v_streak 
  FROM public.profiles WHERE id = p_user_id;
  
  -- Calculate streak bonus
  v_streak_bonus := (v_base_amount * LEAST(v_streak * v_streak_bonus_pct, v_max_streak_bonus_pct) / 100);
  
  -- Calculate total (capped at max)
  v_total := LEAST(v_base_amount + v_streak_bonus, v_max_amount);
  
  RETURN QUERY SELECT v_base_amount, v_streak_bonus, v_total, v_streak;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user stats
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS TABLE (
  total_balance BIGINT,
  total_earned BIGINT,
  total_withdrawn BIGINT,
  total_claims INTEGER,
  current_streak INTEGER,
  max_streak INTEGER,
  referral_count INTEGER,
  referral_earnings BIGINT,
  rank_position BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.balance_satoshis,
    p.total_earned_satoshis,
    p.total_withdrawn_satoshis,
    p.total_claims,
    p.claim_streak,
    p.max_claim_streak,
    p.referral_count,
    p.referral_earnings_satoshis,
    (SELECT COUNT(*) + 1 FROM public.profiles WHERE total_earned_satoshis > p.total_earned_satoshis)
  FROM public.profiles p
  WHERE p.id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get leaderboard
CREATE OR REPLACE FUNCTION get_leaderboard(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  username TEXT,
  display_name TEXT,
  total_earned BIGINT,
  total_claims INTEGER,
  max_streak INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY p.total_earned_satoshis DESC),
    p.id,
    p.username,
    p.display_name,
    p.total_earned_satoshis,
    p.total_claims,
    p.max_claim_streak
  FROM public.profiles p
  WHERE p.status = 'active'
  ORDER BY p.total_earned_satoshis DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

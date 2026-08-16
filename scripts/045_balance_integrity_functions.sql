-- =============================================================================
-- Script 045: Balance Integrity Functions
-- =============================================================================
-- This script creates database functions for robust balance management
-- ensuring every satoshi is validated and traceable.
-- =============================================================================

-- Function to calculate user balance from transaction history
-- This is the SOURCE OF TRUTH for what a user's balance SHOULD be
CREATE OR REPLACE FUNCTION calculate_user_balance_from_transactions(p_user_id UUID)
RETURNS TABLE (
  computed_balance BIGINT,
  computed_total_earned BIGINT,
  computed_total_withdrawn BIGINT,
  transaction_count INTEGER,
  last_transaction_at TIMESTAMPTZ
) AS $$
DECLARE
  v_balance BIGINT := 0;
  v_earned BIGINT := 0;
  v_withdrawn BIGINT := 0;
  v_count INTEGER := 0;
  v_last_tx TIMESTAMPTZ := NULL;
  tx RECORD;
BEGIN
  FOR tx IN 
    SELECT type, amount_satoshis, created_at 
    FROM transactions 
    WHERE user_id = p_user_id AND status = 'completed'
    ORDER BY created_at ASC
  LOOP
    IF tx.type = 'withdrawal' THEN
      v_balance := v_balance - tx.amount_satoshis;
      v_withdrawn := v_withdrawn + tx.amount_satoshis;
    ELSE
      v_balance := v_balance + tx.amount_satoshis;
      v_earned := v_earned + tx.amount_satoshis;
    END IF;
    v_count := v_count + 1;
    v_last_tx := tx.created_at;
  END LOOP;
  
  RETURN QUERY SELECT v_balance, v_earned, v_withdrawn, v_count, v_last_tx;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to validate a user's balance integrity
CREATE OR REPLACE FUNCTION validate_user_balance_integrity(p_user_id UUID)
RETURNS TABLE (
  is_valid BOOLEAN,
  stored_balance BIGINT,
  computed_balance BIGINT,
  discrepancy BIGINT,
  issues TEXT[]
) AS $$
DECLARE
  v_profile RECORD;
  v_computed RECORD;
  v_issues TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Get stored balance
  SELECT balance_satoshis, total_earned_satoshis, total_withdrawn_satoshis
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN,
      0::BIGINT,
      0::BIGINT,
      0::BIGINT,
      ARRAY['Profile not found']::TEXT[];
    RETURN;
  END IF;
  
  -- Get computed balance
  SELECT * INTO v_computed
  FROM calculate_user_balance_from_transactions(p_user_id);
  
  -- Check for discrepancies
  IF v_profile.balance_satoshis != v_computed.computed_balance THEN
    v_issues := array_append(v_issues, 
      format('Balance mismatch: stored=%s, computed=%s', 
        v_profile.balance_satoshis, v_computed.computed_balance));
  END IF;
  
  IF v_profile.total_earned_satoshis != v_computed.computed_total_earned THEN
    v_issues := array_append(v_issues,
      format('Total earned mismatch: stored=%s, computed=%s',
        v_profile.total_earned_satoshis, v_computed.computed_total_earned));
  END IF;
  
  IF v_profile.total_withdrawn_satoshis != v_computed.computed_total_withdrawn THEN
    v_issues := array_append(v_issues,
      format('Total withdrawn mismatch: stored=%s, computed=%s',
        v_profile.total_withdrawn_satoshis, v_computed.computed_total_withdrawn));
  END IF;
  
  RETURN QUERY SELECT
    (v_profile.balance_satoshis = v_computed.computed_balance)::BOOLEAN,
    v_profile.balance_satoshis,
    v_computed.computed_balance,
    (v_profile.balance_satoshis - v_computed.computed_balance)::BIGINT,
    v_issues;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to safely modify balance with full validation
-- This ensures atomic updates with transaction logging
CREATE OR REPLACE FUNCTION modify_user_balance(
  p_user_id UUID,
  p_amount BIGINT,
  p_type TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  previous_balance BIGINT,
  new_balance BIGINT,
  transaction_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_current_balance BIGINT;
  v_new_balance BIGINT;
  v_tx_id UUID;
  v_is_withdrawal BOOLEAN;
BEGIN
  -- Lock the profile row for update
  SELECT balance_satoshis INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN,
      0::BIGINT,
      0::BIGINT,
      NULL::UUID,
      'Profile not found'::TEXT;
    RETURN;
  END IF;
  
  -- Calculate new balance
  v_new_balance := v_current_balance + p_amount;
  v_is_withdrawal := p_type = 'withdrawal' OR p_amount < 0;
  
  -- Validate new balance is non-negative
  IF v_new_balance < 0 THEN
    RETURN QUERY SELECT
      FALSE::BOOLEAN,
      v_current_balance,
      v_current_balance,
      NULL::UUID,
      'Insufficient balance'::TEXT;
    RETURN;
  END IF;
  
  -- Create transaction record FIRST
  INSERT INTO transactions (
    user_id,
    type,
    amount_satoshis,
    balance_before,
    balance_after,
    status,
    description,
    metadata
  ) VALUES (
    p_user_id,
    p_type,
    ABS(p_amount),
    v_current_balance,
    v_new_balance,
    'completed',
    p_description,
    p_metadata || jsonb_build_object('integrity_version', '5.0', 'server_time', NOW())
  ) RETURNING id INTO v_tx_id;
  
  -- Update profile
  UPDATE profiles
  SET 
    balance_satoshis = v_new_balance,
    total_earned_satoshis = CASE 
      WHEN NOT v_is_withdrawal THEN total_earned_satoshis + ABS(p_amount)
      ELSE total_earned_satoshis
    END,
    total_withdrawn_satoshis = CASE
      WHEN v_is_withdrawal THEN total_withdrawn_satoshis + ABS(p_amount)
      ELSE total_withdrawn_satoshis
    END,
    total_claims = CASE
      WHEN p_type = 'claim' THEN total_claims + 1
      ELSE total_claims
    END,
    last_claim_at = CASE
      WHEN p_type = 'claim' THEN NOW()
      ELSE last_claim_at
    END,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  RETURN QUERY SELECT
    TRUE::BOOLEAN,
    v_current_balance,
    v_new_balance,
    v_tx_id,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the handle_new_user function to be idempotent
-- This prevents duplicate profile creation on re-login
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  ref_code TEXT;
  referrer_id UUID;
  signup_bonus_amount BIGINT := 100; -- 100 satoshis signup bonus
  existing_profile_id UUID;
BEGIN
  -- Check if profile already exists (idempotency)
  SELECT id INTO existing_profile_id
  FROM public.profiles
  WHERE id = NEW.id;
  
  IF existing_profile_id IS NOT NULL THEN
    -- Profile already exists, do nothing
    -- This prevents balance reset on re-login
    RETURN NEW;
  END IF;

  -- Generate unique referral code
  LOOP
    ref_code := generate_referral_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = ref_code);
  END LOOP;
  
  -- Check if referred by someone
  IF NEW.raw_user_meta_data->>'referred_by' IS NOT NULL THEN
    SELECT id INTO referrer_id 
    FROM public.profiles 
    WHERE referral_code = NEW.raw_user_meta_data->>'referred_by'
    AND status != 'banned';
  END IF;
  
  -- Insert profile WITH signup bonus (only for truly new users)
  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    referral_code,
    referred_by,
    status,
    balance_satoshis,
    total_earned_satoshis
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NULL),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    ref_code,
    referrer_id,
    'active',
    signup_bonus_amount,  -- Credit 100 satoshis
    signup_bonus_amount   -- Track in total earned
  ) ON CONFLICT (id) DO NOTHING; -- Extra safety
  
  -- Only create transaction if we actually inserted a new profile
  IF FOUND THEN
    -- Create transaction record for signup bonus
    INSERT INTO public.transactions (
      user_id,
      type,
      amount_satoshis,
      balance_before,
      balance_after,
      status,
      description,
      metadata
    ) VALUES (
      NEW.id,
      'signup_bonus',
      signup_bonus_amount,
      0,
      signup_bonus_amount,
      'completed',
      'Welcome bonus for new users',
      jsonb_build_object(
        'bonus_type', 'signup',
        'email', NEW.email,
        'created_at', NOW(),
        'integrity_version', '5.0'
      )
    );
    
    -- Update referrer's count if applicable
    IF referrer_id IS NOT NULL THEN
      UPDATE public.profiles 
      SET referral_count = referral_count + 1 
      WHERE id = referrer_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create index for faster balance calculations
CREATE INDEX IF NOT EXISTS idx_transactions_user_status_type 
ON transactions(user_id, status, type);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_user_balance_from_transactions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_user_balance_integrity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION modify_user_balance(UUID, BIGINT, TEXT, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION calculate_user_balance_from_transactions IS 
  'Calculates user balance from transaction history - source of truth';
COMMENT ON FUNCTION validate_user_balance_integrity IS 
  'Validates that stored balance matches computed balance from transactions';
COMMENT ON FUNCTION modify_user_balance IS 
  'Safely modifies user balance with atomic transaction logging';

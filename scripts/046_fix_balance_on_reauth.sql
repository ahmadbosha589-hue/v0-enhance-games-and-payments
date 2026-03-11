-- =============================================================================
-- Script 046: Fix Balance Reset on Re-authentication (v6.0)
-- =============================================================================
-- 
-- ISSUE: User balance resets to 100 satoshis when they log out and log back in
-- 
-- ROOT CAUSE: The handle_new_user() trigger was firing on every auth event
-- and the idempotency check wasn't working correctly. The trigger would
-- sometimes recreate the profile or the ON CONFLICT behavior was inconsistent.
--
-- FIX: This script completely rewrites the handle_new_user function to be
-- 100% idempotent and NEVER modify existing balances under any circumstances.
--
-- PRINCIPLE: NEVER TRUST CLIENT-SIDE - All balance operations are atomic
-- and server-validated. The balance is ONLY derived from transaction history.
--
-- =============================================================================

-- Drop and recreate the handle_new_user function with proper idempotency
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  ref_code TEXT;
  referrer_id UUID;
  signup_bonus_amount BIGINT := 100; -- 100 satoshis signup bonus
  v_profile_exists BOOLEAN;
BEGIN
  -- =========================================================================
  -- CRITICAL: Check if profile ALREADY exists FIRST
  -- If it does, DO NOTHING - never modify existing profiles
  -- This is the PRIMARY defense against balance reset
  -- =========================================================================
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = NEW.id
  ) INTO v_profile_exists;
  
  IF v_profile_exists THEN
    -- Profile already exists - user is re-authenticating
    -- DO NOT touch their balance or any other data
    -- Just update last_active_at timestamp
    UPDATE public.profiles 
    SET last_active_at = NOW()
    WHERE id = NEW.id;
    
    RETURN NEW;
  END IF;
  
  -- =========================================================================
  -- Profile does NOT exist - this is a genuinely NEW user
  -- Only now do we create profile and give signup bonus
  -- =========================================================================

  -- Generate unique referral code
  LOOP
    ref_code := generate_referral_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = ref_code);
  END LOOP;
  
  -- Check if referred by someone (only for new users)
  IF NEW.raw_user_meta_data->>'referred_by' IS NOT NULL THEN
    SELECT id INTO referrer_id 
    FROM public.profiles 
    WHERE referral_code = NEW.raw_user_meta_data->>'referred_by'
      AND status != 'banned'
      AND is_flagged = FALSE;
  END IF;
  
  -- Insert NEW profile WITH signup bonus
  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    referral_code,
    referred_by,
    status,
    balance_satoshis,
    total_earned_satoshis,
    total_claims,
    claim_streak,
    max_claim_streak,
    fraud_score,
    created_at,
    updated_at,
    last_active_at
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NULL),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    ref_code,
    referrer_id,
    'active',
    signup_bonus_amount,  -- Initial balance: 100 satoshis
    signup_bonus_amount,  -- Track in total earned
    0,                    -- No claims yet
    0,                    -- No streak yet
    0,                    -- No max streak yet
    0,                    -- Clean fraud score
    NOW(),
    NOW(),
    NOW()
  );
  
  -- Create transaction record for signup bonus (audit trail)
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
      'integrity_version', '6.0',
      'trigger_version', '046'
    )
  );
  
  -- Update referrer's count if applicable
  IF referrer_id IS NOT NULL THEN
    UPDATE public.profiles 
    SET referral_count = referral_count + 1 
    WHERE id = referrer_id;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Race condition: profile was created by another process
    -- This is fine - just return without error
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't fail authentication
    RAISE WARNING 'handle_new_user error for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- Create a function to verify and repair balance integrity
-- This can be called manually or via cron to ensure balances are correct
-- =============================================================================
CREATE OR REPLACE FUNCTION verify_and_repair_all_balances()
RETURNS TABLE (
  user_id UUID,
  stored_balance BIGINT,
  computed_balance BIGINT,
  was_repaired BOOLEAN
) AS $$
DECLARE
  v_user RECORD;
  v_computed RECORD;
  v_repaired BOOLEAN;
BEGIN
  FOR v_user IN 
    SELECT p.id, p.balance_satoshis 
    FROM profiles p
  LOOP
    v_repaired := FALSE;
    
    -- Calculate what balance SHOULD be from transactions
    SELECT 
      COALESCE(SUM(CASE 
        WHEN type = 'withdrawal' THEN -amount_satoshis 
        ELSE amount_satoshis 
      END), 0) as computed
    INTO v_computed
    FROM transactions
    WHERE user_id = v_user.id
      AND status = 'completed';
    
    -- If mismatch, repair it
    IF v_user.balance_satoshis != v_computed.computed THEN
      UPDATE profiles 
      SET 
        balance_satoshis = v_computed.computed,
        updated_at = NOW()
      WHERE id = v_user.id;
      v_repaired := TRUE;
      
      -- Log the repair
      INSERT INTO transactions (
        user_id, type, amount_satoshis, 
        balance_before, balance_after, 
        status, description, metadata
      ) VALUES (
        v_user.id, 
        'adjustment',
        ABS(v_computed.computed - v_user.balance_satoshis),
        v_user.balance_satoshis,
        v_computed.computed,
        'completed',
        'Automatic balance repair by integrity system',
        jsonb_build_object(
          'repair_type', 'auto_integrity_check',
          'discrepancy', v_computed.computed - v_user.balance_satoshis,
          'trigger_version', '046'
        )
      );
    END IF;
    
    RETURN QUERY SELECT v_user.id, v_user.balance_satoshis, v_computed.computed, v_repaired;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Create function to get user's authoritative balance
-- This ALWAYS computes from transaction history - the source of truth
-- =============================================================================
CREATE OR REPLACE FUNCTION get_authoritative_balance(p_user_id UUID)
RETURNS TABLE (
  balance BIGINT,
  total_earned BIGINT,
  total_withdrawn BIGINT,
  transaction_count INTEGER,
  is_verified BOOLEAN
) AS $$
DECLARE
  v_stored_balance BIGINT;
  v_computed_balance BIGINT;
  v_earned BIGINT;
  v_withdrawn BIGINT;
  v_count INTEGER;
BEGIN
  -- Get stored balance
  SELECT balance_satoshis INTO v_stored_balance
  FROM profiles WHERE id = p_user_id;
  
  -- Compute from transactions
  SELECT 
    COALESCE(SUM(CASE WHEN type != 'withdrawal' THEN amount_satoshis ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount_satoshis ELSE 0 END), 0),
    COUNT(*)
  INTO v_earned, v_withdrawn, v_count
  FROM transactions
  WHERE user_id = p_user_id
    AND status = 'completed';
  
  v_computed_balance := v_earned - v_withdrawn;
  
  RETURN QUERY SELECT 
    v_computed_balance,
    v_earned,
    v_withdrawn,
    v_count,
    (v_stored_balance = v_computed_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- Create a function to safely add balance with full atomicity
-- This is the ONLY way balance should ever be modified
-- =============================================================================
CREATE OR REPLACE FUNCTION safe_add_balance(
  p_user_id UUID,
  p_amount BIGINT,
  p_type TEXT,
  p_description TEXT DEFAULT '',
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
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
  -- Check idempotency key first
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_tx_id
    FROM transactions
    WHERE user_id = p_user_id
      AND metadata->>'idempotency_key' = p_idempotency_key;
    
    IF v_tx_id IS NOT NULL THEN
      RETURN QUERY SELECT FALSE, 0::BIGINT, v_tx_id, 'Duplicate transaction';
      RETURN;
    END IF;
  END IF;
  
  -- Lock the profile row for atomic update
  SELECT balance_satoshis INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::BIGINT, NULL::UUID, 'Profile not found';
    RETURN;
  END IF;
  
  -- Calculate new balance
  v_new_balance := v_current_balance + p_amount;
  v_is_withdrawal := p_type = 'withdrawal' OR p_amount < 0;
  
  -- Validate non-negative
  IF v_new_balance < 0 THEN
    RETURN QUERY SELECT FALSE, v_current_balance, NULL::UUID, 'Insufficient balance';
    RETURN;
  END IF;
  
  -- Create transaction record FIRST (audit trail)
  INSERT INTO transactions (
    user_id, type, amount_satoshis,
    balance_before, balance_after,
    status, description, metadata
  ) VALUES (
    p_user_id, p_type, ABS(p_amount),
    v_current_balance, v_new_balance,
    'completed', p_description,
    p_metadata || jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'integrity_version', '6.0',
      'server_time', NOW()
    )
  ) RETURNING id INTO v_tx_id;
  
  -- Update profile balance
  UPDATE profiles SET
    balance_satoshis = v_new_balance,
    total_earned_satoshis = CASE 
      WHEN NOT v_is_withdrawal THEN total_earned_satoshis + ABS(p_amount)
      ELSE total_earned_satoshis
    END,
    total_withdrawn_satoshis = CASE
      WHEN v_is_withdrawal THEN total_withdrawn_satoshis + ABS(p_amount)
      ELSE total_withdrawn_satoshis
    END,
    total_claims = CASE WHEN p_type = 'claim' THEN total_claims + 1 ELSE total_claims END,
    last_claim_at = CASE WHEN p_type = 'claim' THEN NOW() ELSE last_claim_at END,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  RETURN QUERY SELECT TRUE, v_new_balance, v_tx_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Grant permissions
-- =============================================================================
GRANT EXECUTE ON FUNCTION get_authoritative_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_and_repair_all_balances() TO service_role;
GRANT EXECUTE ON FUNCTION safe_add_balance(UUID, BIGINT, TEXT, TEXT, JSONB, TEXT) TO service_role;

-- =============================================================================
-- Add comments
-- =============================================================================
COMMENT ON FUNCTION handle_new_user() IS 
  'v6.0: Idempotent user creation trigger - NEVER modifies existing profiles/balances';
COMMENT ON FUNCTION get_authoritative_balance(UUID) IS 
  'Returns the computed balance from transaction history - source of truth';
COMMENT ON FUNCTION safe_add_balance(UUID, BIGINT, TEXT, TEXT, JSONB, TEXT) IS 
  'Atomically adds/subtracts balance with full audit trail and idempotency';
COMMENT ON FUNCTION verify_and_repair_all_balances() IS 
  'Batch verifies and repairs all user balances against transaction history';

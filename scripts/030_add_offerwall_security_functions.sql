-- =====================================================
-- Offerwall Security & Atomicity Functions
-- Script: 030_add_offerwall_security_functions.sql
-- Purpose: Add database functions for atomic offerwall operations
-- =====================================================

-- Function to atomically credit offerwall reward
-- This prevents double-credits and race conditions
CREATE OR REPLACE FUNCTION process_offerwall_conversion(
  p_user_id UUID,
  p_provider_id UUID,
  p_offer_id TEXT,
  p_offer_name TEXT,
  p_payout_credits DECIMAL,
  p_payout_satoshis BIGINT,
  p_transaction_id TEXT,
  p_ip_address INET DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE
  v_conversion_id UUID;
  v_old_balance BIGINT;
  v_new_balance BIGINT;
  v_result JSONB;
BEGIN
  -- Check if transaction already exists (idempotency)
  SELECT id INTO v_conversion_id
  FROM offerwall_conversions
  WHERE transaction_id = p_transaction_id;
  
  IF v_conversion_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'duplicate',
      'message', 'Transaction already processed'
    );
  END IF;
  
  -- Get current user balance with row lock
  SELECT balance_satoshis INTO v_old_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF v_old_balance IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'user_not_found',
      'message', 'User does not exist'
    );
  END IF;
  
  v_new_balance := v_old_balance + p_payout_satoshis;
  
  -- Insert conversion record
  INSERT INTO offerwall_conversions (
    user_id,
    provider_id,
    offer_id,
    offer_name,
    payout_credits,
    payout_satoshis,
    transaction_id,
    ip_address,
    status,
    processed_at,
    metadata
  ) VALUES (
    p_user_id,
    p_provider_id,
    p_offer_id,
    p_offer_name,
    p_payout_credits,
    p_payout_satoshis,
    p_transaction_id,
    p_ip_address,
    'approved',
    NOW(),
    p_metadata
  )
  RETURNING id INTO v_conversion_id;
  
  -- Update user balance
  UPDATE profiles
  SET 
    balance_satoshis = v_new_balance,
    total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + p_payout_satoshis,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Update provider stats
  UPDATE offerwall_providers
  SET
    total_conversions = COALESCE(total_conversions, 0) + 1,
    total_paid_satoshis = COALESCE(total_paid_satoshis, 0) + p_payout_satoshis,
    updated_at = NOW()
  WHERE id = p_provider_id;
  
  -- Create transaction record
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
    'offerwall',
    p_payout_satoshis,
    v_old_balance,
    v_new_balance,
    'completed',
    p_offer_name,
    jsonb_build_object('conversion_id', v_conversion_id, 'provider_id', p_provider_id)
  );
  
  -- Create notification
  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    metadata
  ) VALUES (
    p_user_id,
    'offerwall_credit',
    'Offerwall Reward!',
    'You earned ' || p_payout_satoshis || ' satoshis from ' || p_offer_name,
    jsonb_build_object('amount', p_payout_satoshis, 'offer_name', p_offer_name)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'conversion_id', v_conversion_id,
    'old_balance', v_old_balance,
    'new_balance', v_new_balance,
    'credited', p_payout_satoshis
  );
  
EXCEPTION
  WHEN unique_violation THEN
    -- Handle race condition where transaction_id was inserted between check and insert
    RETURN jsonb_build_object(
      'success', false,
      'error', 'duplicate',
      'message', 'Transaction already processed (race condition)'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'database_error',
      'message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION process_offerwall_conversion TO service_role;

-- Function to reverse an offerwall conversion (for chargebacks)
CREATE OR REPLACE FUNCTION reverse_offerwall_conversion(
  p_transaction_id TEXT,
  p_reason TEXT DEFAULT 'Chargeback'
) RETURNS JSONB AS $$
DECLARE
  v_conversion RECORD;
  v_current_balance BIGINT;
BEGIN
  -- Get conversion details with lock
  SELECT * INTO v_conversion
  FROM offerwall_conversions
  WHERE transaction_id = p_transaction_id
  FOR UPDATE;
  
  IF v_conversion IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not_found',
      'message', 'Conversion not found'
    );
  END IF;
  
  IF v_conversion.status = 'reversed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_reversed',
      'message', 'Conversion already reversed'
    );
  END IF;
  
  -- Get current user balance
  SELECT balance_satoshis INTO v_current_balance
  FROM profiles
  WHERE id = v_conversion.user_id
  FOR UPDATE;
  
  -- Update conversion status
  UPDATE offerwall_conversions
  SET 
    status = 'reversed',
    metadata = metadata || jsonb_build_object('reversed_at', NOW(), 'reverse_reason', p_reason),
    updated_at = NOW()
  WHERE id = v_conversion.id;
  
  -- Deduct from user balance (don't go negative)
  UPDATE profiles
  SET 
    balance_satoshis = GREATEST(0, balance_satoshis - v_conversion.payout_satoshis),
    total_earned_satoshis = GREATEST(0, COALESCE(total_earned_satoshis, 0) - v_conversion.payout_satoshis),
    updated_at = NOW()
  WHERE id = v_conversion.user_id;
  
  -- Update provider stats
  UPDATE offerwall_providers
  SET
    total_conversions = GREATEST(0, COALESCE(total_conversions, 0) - 1),
    total_paid_satoshis = GREATEST(0, COALESCE(total_paid_satoshis, 0) - v_conversion.payout_satoshis),
    updated_at = NOW()
  WHERE id = v_conversion.provider_id;
  
  -- Create reversal transaction record
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
    v_conversion.user_id,
    'offerwall_reversal',
    -v_conversion.payout_satoshis,
    v_current_balance,
    GREATEST(0, v_current_balance - v_conversion.payout_satoshis),
    'completed',
    'Reversal: ' || v_conversion.offer_name,
    jsonb_build_object('conversion_id', v_conversion.id, 'reason', p_reason)
  );
  
  -- Create notification
  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    metadata
  ) VALUES (
    v_conversion.user_id,
    'offerwall_reversal',
    'Offer Reversed',
    'A previous reward of ' || v_conversion.payout_satoshis || ' satoshis has been reversed.',
    jsonb_build_object('amount', v_conversion.payout_satoshis, 'reason', p_reason)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'reversed_amount', v_conversion.payout_satoshis,
    'new_balance', GREATEST(0, v_current_balance - v_conversion.payout_satoshis)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'database_error',
      'message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION reverse_offerwall_conversion TO service_role;

-- Add index for faster duplicate checks
CREATE INDEX IF NOT EXISTS idx_offerwall_conversions_transaction_id 
ON offerwall_conversions(transaction_id);

-- Add index for user conversion lookups
CREATE INDEX IF NOT EXISTS idx_offerwall_conversions_user_status 
ON offerwall_conversions(user_id, status, created_at DESC);

-- Comment on functions
COMMENT ON FUNCTION process_offerwall_conversion IS 'Atomically processes an offerwall conversion with idempotency protection';
COMMENT ON FUNCTION reverse_offerwall_conversion IS 'Reverses a previously credited offerwall conversion (for chargebacks)';

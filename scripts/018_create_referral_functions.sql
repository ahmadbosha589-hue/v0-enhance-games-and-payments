-- =====================================================
-- Referral Commission Processing
-- =====================================================

CREATE OR REPLACE FUNCTION process_referral_commission(
  p_claim_id UUID,
  p_referrer_id UUID,
  p_claim_amount BIGINT,
  p_commission_rate NUMERIC DEFAULT 0.10 -- 10% default
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_commission BIGINT;
  v_transaction_id UUID;
  v_referrer profiles%ROWTYPE;
BEGIN
  -- Calculate commission
  v_commission := CEIL(p_claim_amount * p_commission_rate);
  
  IF v_commission < 1 THEN
    RETURN jsonb_build_object('success', true, 'commission', 0, 'message', 'Commission too small');
  END IF;
  
  -- Get referrer with lock
  SELECT * INTO v_referrer FROM profiles WHERE id = p_referrer_id FOR UPDATE;
  
  IF NOT FOUND OR v_referrer.status = 'banned' THEN
    RETURN jsonb_build_object('success', false, 'error', 'REFERRER_NOT_FOUND');
  END IF;
  
  -- Update referrer balance
  UPDATE profiles SET
    balance_satoshis = balance_satoshis + v_commission,
    total_earned_satoshis = total_earned_satoshis + v_commission,
    referral_earnings_satoshis = referral_earnings_satoshis + v_commission,
    updated_at = NOW()
  WHERE id = p_referrer_id;
  
  -- Create transaction
  INSERT INTO transactions (
    user_id, type, amount_satoshis,
    balance_before, balance_after,
    claim_id, status, description
  ) VALUES (
    p_referrer_id, 'referral_bonus', v_commission,
    v_referrer.balance_satoshis, v_referrer.balance_satoshis + v_commission,
    p_claim_id, 'completed', 'Referral commission'
  ) RETURNING id INTO v_transaction_id;
  
  -- Create notification
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    p_referrer_id, 'referral_bonus',
    'Referral Bonus!',
    'You earned ' || v_commission || ' satoshis from a referral claim',
    jsonb_build_object('amount', v_commission, 'claim_id', p_claim_id)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'commission', v_commission,
    'transaction_id', v_transaction_id
  );
END;
$$;

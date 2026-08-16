-- =====================================================
-- Atomic Withdrawal Function with Idempotency
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
  v_min_withdrawal BIGINT := 5000; -- 5000 satoshis minimum
  v_max_daily BIGINT := 1000000; -- 1M satoshis daily max
  v_fee_rate NUMERIC := 0.02; -- 2% fee
  v_fraud_score INTEGER := 0;
BEGIN
  -- Generate lock ID
  v_lock_id := ('x' || substr(md5(p_user_id::text || 'withdraw'), 1, 15))::bit(60)::bigint;
  
  -- Acquire advisory lock
  IF NOT pg_try_advisory_xact_lock(v_lock_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'WITHDRAWAL_IN_PROGRESS',
      'message', 'Another withdrawal is being processed'
    );
  END IF;
  
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_withdrawal_id FROM withdrawals 
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_withdrawal_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'DUPLICATE_WITHDRAWAL',
        'message', 'This withdrawal has already been submitted',
        'withdrawal_id', v_withdrawal_id
      );
    END IF;
  END IF;
  
  -- Get profile with lock
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;
  
  IF v_profile.status = 'banned' THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_BANNED');
  END IF;
  
  -- Validate amount
  IF p_amount < v_min_withdrawal THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AMOUNT_TOO_LOW',
      'message', 'Minimum withdrawal is ' || v_min_withdrawal || ' satoshis',
      'minimum', v_min_withdrawal
    );
  END IF;
  
  IF p_amount > v_profile.balance_satoshis THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_BALANCE',
      'message', 'Insufficient balance',
      'balance', v_profile.balance_satoshis
    );
  END IF;
  
  -- Check pending withdrawals
  SELECT COUNT(*) INTO v_pending_count FROM withdrawals 
  WHERE user_id = p_user_id AND status = 'pending';
  
  IF v_pending_count >= 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TOO_MANY_PENDING',
      'message', 'You have too many pending withdrawals'
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
      'already_withdrawn', v_daily_withdrawn
    );
  END IF;
  
  -- Calculate fee
  v_fee := CEIL(p_amount * v_fee_rate);
  v_net_amount := p_amount - v_fee;
  
  -- Calculate fraud score for withdrawal
  v_fraud_score := v_profile.fraud_score;
  IF v_profile.total_claims < 10 THEN
    v_fraud_score := v_fraud_score + 20;
  END IF;
  IF p_amount > v_profile.total_earned_satoshis * 0.5 THEN
    v_fraud_score := v_fraud_score + 15;
  END IF;
  
  -- Create withdrawal
  INSERT INTO withdrawals (
    user_id, amount_satoshis, fee_satoshis, net_amount_satoshis,
    payment_method, payment_address, payment_currency,
    status, idempotency_key, fraud_score, is_flagged
  ) VALUES (
    p_user_id, p_amount, v_fee, v_net_amount,
    p_payment_method, p_payment_address, p_payment_currency,
    'pending', p_idempotency_key, v_fraud_score, v_fraud_score > 70
  ) RETURNING id INTO v_withdrawal_id;
  
  -- Deduct from balance
  UPDATE profiles SET
    balance_satoshis = balance_satoshis - p_amount,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Create transaction
  INSERT INTO transactions (
    user_id, type, amount_satoshis,
    balance_before, balance_after,
    withdrawal_id, status, idempotency_key,
    description
  ) VALUES (
    p_user_id, 'withdrawal', -p_amount,
    v_profile.balance_satoshis, v_profile.balance_satoshis - p_amount,
    v_withdrawal_id, 'pending', p_idempotency_key,
    'Withdrawal to ' || p_payment_method
  ) RETURNING id INTO v_transaction_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'transaction_id', v_transaction_id,
    'amount', p_amount,
    'fee', v_fee,
    'net_amount', v_net_amount,
    'new_balance', v_profile.balance_satoshis - p_amount,
    'status', 'pending',
    'flagged', v_fraud_score > 70
  );
END;
$$;

-- =====================================================
-- Process Withdrawal (Admin/System use)
-- =====================================================

CREATE OR REPLACE FUNCTION process_withdrawal(
  p_withdrawal_id UUID,
  p_processor_id UUID,
  p_action TEXT, -- 'approve', 'reject', 'complete', 'fail'
  p_notes TEXT DEFAULT NULL,
  p_faucetpay_payout_id TEXT DEFAULT NULL,
  p_faucetpay_response JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_withdrawal withdrawals%ROWTYPE;
  v_new_status withdrawal_status;
  v_profile profiles%ROWTYPE;
BEGIN
  -- Get withdrawal with lock
  SELECT * INTO v_withdrawal FROM withdrawals 
  WHERE id = p_withdrawal_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'WITHDRAWAL_NOT_FOUND');
  END IF;
  
  -- Determine new status based on action
  CASE p_action
    WHEN 'approve' THEN
      IF v_withdrawal.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
      END IF;
      v_new_status := 'processing';
      
    WHEN 'reject' THEN
      IF v_withdrawal.status NOT IN ('pending', 'processing') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
      END IF;
      v_new_status := 'rejected';
      
      -- Refund balance
      UPDATE profiles SET
        balance_satoshis = balance_satoshis + v_withdrawal.amount_satoshis,
        updated_at = NOW()
      WHERE id = v_withdrawal.user_id;
      
      -- Update transaction
      UPDATE transactions SET
        status = 'failed',
        completed_at = NOW()
      WHERE withdrawal_id = p_withdrawal_id;
      
    WHEN 'complete' THEN
      IF v_withdrawal.status != 'processing' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
      END IF;
      v_new_status := 'completed';
      
      -- Update user stats
      UPDATE profiles SET
        total_withdrawn_satoshis = total_withdrawn_satoshis + v_withdrawal.amount_satoshis,
        updated_at = NOW()
      WHERE id = v_withdrawal.user_id;
      
      -- Update transaction
      UPDATE transactions SET
        status = 'completed',
        completed_at = NOW()
      WHERE withdrawal_id = p_withdrawal_id;
      
    WHEN 'fail' THEN
      IF v_withdrawal.status != 'processing' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
      END IF;
      v_new_status := 'failed';
      
      -- Refund balance
      UPDATE profiles SET
        balance_satoshis = balance_satoshis + v_withdrawal.amount_satoshis,
        updated_at = NOW()
      WHERE id = v_withdrawal.user_id;
      
      -- Update transaction
      UPDATE transactions SET
        status = 'failed',
        completed_at = NOW()
      WHERE withdrawal_id = p_withdrawal_id;
      
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTION');
  END CASE;
  
  -- Update withdrawal
  UPDATE withdrawals SET
    status = v_new_status,
    processed_by = p_processor_id,
    processed_at = CASE WHEN p_action IN ('complete', 'fail', 'reject') THEN NOW() ELSE processed_at END,
    reviewed_by = CASE WHEN p_action IN ('approve', 'reject') THEN p_processor_id ELSE reviewed_by END,
    reviewed_at = CASE WHEN p_action IN ('approve', 'reject') THEN NOW() ELSE reviewed_at END,
    review_notes = COALESCE(p_notes, review_notes),
    faucetpay_payout_id = COALESCE(p_faucetpay_payout_id, faucetpay_payout_id),
    faucetpay_response = COALESCE(p_faucetpay_response, faucetpay_response),
    updated_at = NOW()
  WHERE id = p_withdrawal_id;
  
  -- Create audit log
  INSERT INTO audit_logs (
    actor_id, actor_role, action, resource_type, resource_id,
    old_data, new_data, metadata
  ) VALUES (
    p_processor_id, 'admin', 
    ('withdrawal_' || p_action)::audit_action,
    'withdrawal', p_withdrawal_id,
    to_jsonb(v_withdrawal),
    jsonb_build_object('status', v_new_status, 'notes', p_notes),
    jsonb_build_object('ip', NULL)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'new_status', v_new_status,
    'action', p_action
  );
END;
$$;

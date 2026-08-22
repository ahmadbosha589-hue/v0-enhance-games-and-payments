-- 094: User-value-backed CCPayment swap.
--
-- Every swap now consumes USER satoshi balance instead of platform merchant
-- funds. This migration is additive and safe to re-run through the
-- checksum-aware runner.
--
-- Flow ownership:
--   execute_user_swap  - atomic balance debit + pending_debit swap row + ledger
--   settle_user_swap   - marks the swap completed after provider success + ledger
--   refund_user_swap   - restores the debited satoshis when the provider fails

-- Ledger labels for the three money events of a user-backed swap.
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'swap_debit';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'swap_settlement';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'swap_refund';

-- The legacy status CHECK only allowed ('pending','completed','failed').
-- Widen it to cover the debit-hold and refund states without dropping history.
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  FOR v_conname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.ccpayment_swaps'::regclass
      AND con.contype = 'c'
      AND att.attname = 'status'
      AND con.conname <> 'ccpayment_swaps_status_check'
  LOOP
    EXECUTE format('ALTER TABLE public.ccpayment_swaps DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

ALTER TABLE public.ccpayment_swaps DROP CONSTRAINT IF EXISTS ccpayment_swaps_status_check;

ALTER TABLE public.ccpayment_swaps ADD CONSTRAINT ccpayment_swaps_status_check
  CHECK (status IN ('pending_debit', 'pending', 'completed', 'failed', 'refunded'));

-- Audit trail for how much user value each swap consumed / restored.
ALTER TABLE public.ccpayment_swaps
  ADD COLUMN IF NOT EXISTS satoshis_debited BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Atomic user-balance debit. Called ONLY after a fresh server-side quote and
-- server-side satoshi valuation; the caller must never pass client-derived
-- satoshi amounts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_user_swap(
  p_user_id UUID,
  p_merchant_order_id TEXT,
  p_from_coin_id TEXT,
  p_to_coin_id TEXT,
  p_from_amount TEXT,
  p_to_amount TEXT,
  p_rate TEXT,
  p_fee TEXT,
  p_satoshis_debit BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id BIGINT;
  v_profile public.profiles%ROWTYPE;
  v_before BIGINT;
  v_after BIGINT;
  v_swap_id UUID;
  v_tx_id UUID;
BEGIN
  IF p_merchant_order_id IS NULL OR p_merchant_order_id = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ORDER', 'message', 'Merchant order id is required');
  END IF;

  IF p_from_coin_id IS NULL OR p_from_coin_id = '' OR p_to_coin_id IS NULL OR p_to_coin_id = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_COINS', 'message', 'Both swap coins are required');
  END IF;

  IF p_satoshis_debit IS NULL OR p_satoshis_debit <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT', 'message', 'Swap amount must convert to a positive number of satoshis');
  END IF;

  -- Serialize all balance mutations for this user.
  v_lock_id := ('x' || substr(md5(p_user_id::text), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_id);

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', 'Profile not found');
  END IF;

  -- Insert the hold row BEFORE any mutation so duplicate orders can bail out
  -- cleanly without leaving a partial debit behind.
  BEGIN
    INSERT INTO public.ccpayment_swaps (
      user_id, merchant_order_id, from_coin_id, to_coin_id,
      from_amount, to_amount, rate, fee,
      status, satoshis_debited
    ) VALUES (
      p_user_id, p_merchant_order_id, p_from_coin_id, p_to_coin_id,
      p_from_amount, p_to_amount, p_rate, p_fee,
      'pending_debit', p_satoshis_debit
    ) RETURNING id INTO v_swap_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'DUPLICATE_ORDER', 'message', 'This swap order was already submitted');
  END;

  v_before := COALESCE(v_profile.balance_satoshis, 0);
  IF v_before < p_satoshis_debit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_BALANCE',
      'message', 'Insufficient satoshi balance for this swap',
      'balance', v_before,
      'required', p_satoshis_debit
    );
  END IF;

  v_after := v_before - p_satoshis_debit;

  UPDATE public.profiles
  SET balance_satoshis = v_after,
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis, balance_before, balance_after,
    description, metadata, completed_at, idempotency_key
  ) VALUES (
    p_user_id, 'swap_debit', 'completed', -p_satoshis_debit, v_before, v_after,
    'Crypto swap satoshi debit',
    jsonb_build_object(
      'swap_id', v_swap_id,
      'merchant_order_id', p_merchant_order_id,
      'from_coin_id', p_from_coin_id,
      'to_coin_id', p_to_coin_id,
      'from_amount', p_from_amount,
      'satoshis_debited', p_satoshis_debit
    ),
    NOW(),
    'swap_debit_' || p_merchant_order_id
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'swap_id', v_swap_id,
    'transaction_id', v_tx_id,
    'satoshis_debited', p_satoshis_debit,
    'balance_before', v_before,
    'new_balance', v_after
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Provider settlement succeeded: mark the held swap completed and record the
-- settlement ledger row. Idempotent; only swaps still in 'pending_debit' move.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_user_swap(
  p_user_id UUID,
  p_merchant_order_id TEXT,
  p_ccpayment_order_id TEXT,
  p_to_amount TEXT,
  p_tx_hash TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id BIGINT;
  v_swap public.ccpayment_swaps%ROWTYPE;
  v_balance BIGINT;
  v_tx_id UUID;
BEGIN
  SELECT * INTO v_swap
  FROM public.ccpayment_swaps
  WHERE merchant_order_id = p_merchant_order_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SWAP_NOT_FOUND', 'message', 'Swap order not found');
  END IF;

  IF v_swap.status <> 'pending_debit' THEN
    RETURN jsonb_build_object('success', true, 'already_settled', TRUE, 'status', v_swap.status);
  END IF;

  SELECT COALESCE(balance_satoshis, 0) INTO v_balance
  FROM public.profiles WHERE id = p_user_id;

  UPDATE public.ccpayment_swaps
  SET status = 'completed',
      ccpayment_order_id = COALESCE(NULLIF(p_ccpayment_order_id, ''), ccpayment_order_id),
      to_amount = COALESCE(NULLIF(p_to_amount, ''), to_amount),
      tx_hash = COALESCE(NULLIF(p_tx_hash, ''), tx_hash),
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_swap.id;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis, balance_before, balance_after,
    description, metadata, completed_at, idempotency_key
  ) VALUES (
    p_user_id, 'swap_settlement', 'completed', 0, v_balance, v_balance,
    'Crypto swap settled via CCPayment',
    jsonb_build_object(
      'swap_id', v_swap.id,
      'merchant_order_id', p_merchant_order_id,
      'ccpayment_order_id', p_ccpayment_order_id,
      'to_coin_id', v_swap.to_coin_id,
      'to_amount', p_to_amount,
      'satoshis_debited', v_swap.satoshis_debited
    ),
    NOW(),
    'swap_settlement_' || p_merchant_order_id
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_settled', FALSE,
    'swap_id', v_swap.id,
    'transaction_id', v_tx_id,
    'status', 'completed'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Provider settlement failed: restore the debited satoshis, flag the swap as
-- refunded, and write the refund ledger row. Double refunds are impossible
-- because only rows in 'pending_debit' are refundable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_user_swap(
  p_user_id UUID,
  p_merchant_order_id TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id BIGINT;
  v_swap public.ccpayment_swaps%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_refund BIGINT;
  v_before BIGINT;
  v_after BIGINT;
  v_tx_id UUID;
BEGIN
  IF p_merchant_order_id IS NULL OR p_merchant_order_id = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ORDER', 'message', 'Merchant order id is required');
  END IF;

  v_lock_id := ('x' || substr(md5(p_user_id::text), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_id);

  SELECT * INTO v_swap
  FROM public.ccpayment_swaps
  WHERE merchant_order_id = p_merchant_order_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SWAP_NOT_FOUND', 'message', 'Swap order not found');
  END IF;

  IF v_swap.status <> 'pending_debit' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_REFUNDABLE',
      'message', 'Swap is not awaiting settlement',
      'status', v_swap.status
    );
  END IF;

  v_refund := COALESCE(v_swap.satoshis_debited, 0);
  IF v_refund <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'REFUND_INVALID', 'message', 'No debited amount recorded for this swap');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', 'Profile not found');
  END IF;

  v_before := COALESCE(v_profile.balance_satoshis, 0);
  v_after := v_before + v_refund;

  UPDATE public.profiles
  SET balance_satoshis = v_after,
      updated_at = NOW()
  WHERE id = p_user_id;

  UPDATE public.ccpayment_swaps
  SET status = 'refunded',
      error_message = COALESCE(NULLIF(p_reason, ''), error_message),
      refunded_at = NOW(),
      updated_at = NOW()
  WHERE id = v_swap.id;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis, balance_before, balance_after,
    description, metadata, completed_at, idempotency_key
  ) VALUES (
    p_user_id, 'swap_refund', 'completed', v_refund, v_before, v_after,
    'Crypto swap refund (provider settlement failed)',
    jsonb_build_object(
      'swap_id', v_swap.id,
      'merchant_order_id', p_merchant_order_id,
      'reason', p_reason,
      'satoshis_refunded', v_refund
    ),
    NOW(),
    'swap_refund_' || p_merchant_order_id
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'swap_id', v_swap.id,
    'transaction_id', v_tx_id,
    'satoshis_refunded', v_refund,
    'new_balance', v_after
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_user_swap(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_user_swap(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_user_swap(UUID, TEXT, TEXT) TO service_role;

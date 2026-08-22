-- 106: Atomic admin balance-delta RPC (offerwall approve/reverse).
--
-- The offerwall admin approve/reverse paths credited/debited via a
-- read-then-write on a joined balance (lost-update race against concurrent
-- claims) and reverse silently clamped overdrafts to 0. This RPC performs the
-- balance change and its ledger row atomically under a row lock.

CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  p_user_id UUID,
  p_delta BIGINT,
  p_type TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance BIGINT;
  v_new_balance BIGINT;
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_DELTA');
  END IF;
  IF p_type NOT IN ('offerwall', 'adjustment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TYPE');
  END IF;

  SELECT balance_satoshis INTO v_balance
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  v_new_balance := COALESCE(v_balance, 0) + p_delta;

  -- Debits that would overdraw are refused, not clamped: the operator must
  -- know the real state instead of a silent floor-to-zero.
  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_BALANCE',
      'balance', COALESCE(v_balance, 0));
  END IF;

  UPDATE public.profiles
     SET balance_satoshis = v_new_balance,
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.transactions (
    user_id, type, amount_satoshis, balance_before, balance_after,
    status, description, metadata, completed_at
  ) VALUES (
    p_user_id, p_type, p_delta, v_balance, v_new_balance,
    'completed', p_description,
    p_metadata || jsonb_build_object('via', 'admin_adjust_balance'),
    NOW()
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_balance(UUID, BIGINT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(UUID, BIGINT, TEXT, TEXT, JSONB)
  TO service_role;

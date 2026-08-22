-- 105: Atomic admin withdrawal-refund RPC + withdrawal state machine.
--
-- Fixes from the admin audit:
--  (P0) ban cascade refunded N pending withdrawals from ONE stale balance read
--       — with 2+ withdrawals each update overwrote the previous and all but
--       the last refund vanished; no ledger rows; total_withdrawn untouched.
--  (P1) reject path could log a 'refunded' transaction + notify while the
--       balance credit itself was skipped (lost-update race).
--
-- This RPC performs, atomically: balance += amount,
-- total_withdrawn_satoshis -= amount, and a completed 'adjustment' ledger row
-- (negative amount = refund). The CALLER is responsible for having already
-- flipped the withdrawal row to 'rejected' under a status guard.

CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal_refund(
  p_user_id UUID,
  p_withdrawal_id UUID,
  p_amount BIGINT,
  p_description TEXT,
  p_actor TEXT
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
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  SELECT balance_satoshis, COALESCE(balance_satoshis,0) + p_amount
    INTO v_balance, v_new_balance
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  UPDATE public.profiles
     SET balance_satoshis = v_new_balance,
         total_withdrawn_satoshis = GREATEST(COALESCE(total_withdrawn_satoshis,0) - p_amount, 0),
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.transactions (
    user_id, type, amount_satoshis, balance_before, balance_after,
    status, description, metadata, completed_at
  ) VALUES (
    p_user_id, 'adjustment', -p_amount, v_balance, v_new_balance,
    'completed',
    COALESCE(NULLIF(p_description, ''), 'Withdrawal rejected — amount returned to balance'),
    jsonb_build_object('withdrawal_id', p_withdrawal_id, 'refund', true, 'actor', p_actor),
    NOW()
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_withdrawal_refund(UUID, UUID, BIGINT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_withdrawal_refund(UUID, UUID, BIGINT, TEXT, TEXT)
  TO service_role;

-- NOTE: withdrawals.status has no enum/CHECK constraint in this schema
-- (verified live: only column-level checks exist), so no DDL change is needed
-- for the state machine. The 'approved' state is enforced in application code:
-- reject guards exclude it, and the payout worker transitions approved->completed.

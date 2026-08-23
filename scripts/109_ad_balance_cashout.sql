-- 109: Atomic advertising-balance debit/credit RPCs.
--
-- Ad-balance cashouts must deduct BEFORE paying out, and the deduction must
-- be atomic (two concurrent cashouts cannot both pass). These RPCs are the
-- only sanctioned way application code moves ad_balance_usd outside the
-- campaign lifecycle RPCs (create_ad_campaign / refund_campaign).

CREATE OR REPLACE FUNCTION public.debit_ad_balance(
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current NUMERIC(12,4);
  v_after NUMERIC(12,4);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  SELECT ad_balance_usd INTO v_current
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  v_after := COALESCE(v_current, 0) - p_amount;
  IF v_after < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_BALANCE',
      'available', COALESCE(v_current, 0));
  END IF;

  UPDATE public.profiles
     SET ad_balance_usd = v_after, updated_at = NOW()
   WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'new_balance', v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_ad_balance(
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_after NUMERIC(12,4);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  UPDATE public.profiles
     SET ad_balance_usd = COALESCE(ad_balance_usd, 0) + p_amount,
         updated_at = NOW()
   WHERE id = p_user_id
   RETURNING ad_balance_usd INTO v_after;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.debit_ad_balance(UUID, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_ad_balance(UUID, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.credit_ad_balance(UUID, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_ad_balance(UUID, NUMERIC) TO service_role;

CREATE OR REPLACE FUNCTION public.transfer_earnings_to_ad_balance(
  p_user_id UUID,
  p_amount_usd NUMERIC,
  p_price_satoshis BIGINT,
  p_btc_rate NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sats BIGINT;
  v_new_ad NUMERIC(12,4);
BEGIN
  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;
  IF p_price_satoshis IS NULL OR p_price_satoshis <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PRICE');
  END IF;

  -- Lock profile row; verify balance before debiting.
  SELECT balance_satoshis INTO v_sats
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;
  IF COALESCE(v_sats, 0) < p_price_satoshis THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_BALANCE',
      'required', p_price_satoshis, 'available', COALESCE(v_sats, 0));
  END IF;

  UPDATE public.profiles
     SET balance_satoshis = balance_satoshis - p_price_satoshis,
         ad_balance_usd = COALESCE(ad_balance_usd, 0) + p_amount_usd,
         updated_at = NOW()
   WHERE id = p_user_id
   RETURNING ad_balance_usd INTO v_new_ad;

  INSERT INTO public.transactions (
    user_id, type, status, amount_satoshis,
    description, metadata, completed_at
  ) VALUES (
    p_user_id, 'adjustment', 'completed', -p_price_satoshis,
    'Advertising deposit: $' || p_amount_usd::TEXT,
    jsonb_build_object(
      'kind', 'ad_deposit',
      'usd', p_amount_usd,
      'btc_rate', p_btc_rate,
      'charged_satoshis', p_price_satoshis
    ),
    NOW()
  );

  RETURN jsonb_build_object('success', true, 'new_ad_balance', v_new_ad);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_earnings_to_ad_balance(UUID, NUMERIC, BIGINT, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_earnings_to_ad_balance(UUID, NUMERIC, BIGINT, NUMERIC)
  TO service_role;

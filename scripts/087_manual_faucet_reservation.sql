-- 087: Durable/idempotent direct FaucetPay claim reservations.

ALTER TABLE public.manual_faucet_claims
  ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_faucet_claims_request_id
  ON public.manual_faucet_claims(request_id)
  WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_faucet_claims_provider_tx
  ON public.manual_faucet_claims(faucetpay_tx_id)
  WHERE faucetpay_tx_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reserve_manual_faucet_claim(
  p_user_id UUID,
  p_crypto_symbol TEXT,
  p_amount NUMERIC,
  p_usd_value NUMERIC,
  p_request_id TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_fingerprint TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id BIGINT;
  v_existing public.manual_faucet_claims%ROWTYPE;
  v_claim_id UUID;
BEGIN
  IF p_request_id IS NULL OR length(trim(p_request_id)) < 16 OR p_amount <= 0 OR p_crypto_symbol IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_REQUEST', 'message', 'Invalid claim reservation');
  END IF;

  v_lock_id := ('x' || substr(md5(p_user_id::text || ':' || upper(p_crypto_symbol)), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_id);

  SELECT * INTO v_existing
  FROM public.manual_faucet_claims
  WHERE request_id = trim(p_request_id)
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'claim_id', v_existing.id, 'status', v_existing.status, 'duplicate_request', true);
  END IF;

  SELECT * INTO v_existing
  FROM public.manual_faucet_claims
  WHERE user_id = p_user_id
    AND crypto_symbol = upper(p_crypto_symbol)
    AND claimed_at > NOW() - INTERVAL '5 minutes'
    AND status IN ('pending', 'completed')
  ORDER BY claimed_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', CASE WHEN v_existing.status = 'pending' THEN 'PAYOUT_PENDING' ELSE 'COOLDOWN_ACTIVE' END, 'message', CASE WHEN v_existing.status = 'pending' THEN 'A previous payout is still being reconciled' ELSE 'Cooldown active' END, 'claim_id', v_existing.id);
  END IF;

  INSERT INTO public.manual_faucet_claims (
    user_id, crypto_symbol, amount, usd_value, ip_address, fingerprint, status, request_id, claimed_at
  ) VALUES (
    p_user_id, upper(p_crypto_symbol), p_amount, p_usd_value, p_ip_address, p_fingerprint, 'pending', trim(p_request_id), NOW()
  ) RETURNING id INTO v_claim_id;

  RETURN jsonb_build_object('success', true, 'claim_id', v_claim_id, 'status', 'pending', 'duplicate_request', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_manual_faucet_claim(
  p_claim_id UUID,
  p_user_id UUID,
  p_status TEXT,
  p_provider_tx_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim public.manual_faucet_claims%ROWTYPE;
BEGIN
  IF p_status NOT IN ('completed', 'failed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
  END IF;

  SELECT * INTO v_claim
  FROM public.manual_faucet_claims
  WHERE id = p_claim_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_claim.status = p_status AND (p_provider_tx_id IS NULL OR v_claim.faucetpay_tx_id = p_provider_tx_id) THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'status', v_claim.status, 'claim_id', v_claim.id);
  END IF;

  IF v_claim.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_FINALIZED', 'status', v_claim.status);
  END IF;

  UPDATE public.manual_faucet_claims
  SET status = p_status,
      faucetpay_tx_id = p_provider_tx_id,
      claimed_at = COALESCE(claimed_at, NOW())
  WHERE id = p_claim_id AND user_id = p_user_id AND status = 'pending';

  RETURN jsonb_build_object('success', true, 'status', p_status, 'claim_id', p_claim_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_manual_faucet_claim(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_manual_faucet_claim(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_manual_faucet_claim(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_manual_faucet_claim(UUID, UUID, TEXT, TEXT) TO service_role;

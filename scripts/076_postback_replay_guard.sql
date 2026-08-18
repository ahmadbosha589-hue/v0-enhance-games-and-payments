-- Postback replay protection receipt ledger
-- Apply with the Supabase migration runner before enabling external providers.
-- The route currently also relies on the existing unique
-- offerwall_conversions.transaction_id constraint; this table provides a
-- provider-scoped receipt ledger for future chargeback/reconciliation work.

CREATE TABLE IF NOT EXISTS public.postback_receipts (
  provider        TEXT NOT NULL,
  transaction_id  TEXT NOT NULL,
  user_id         UUID,
  amount_credits  NUMERIC(18,8),
  payout_satoshis BIGINT,
  status          TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'duplicate', 'chargeback', 'rejected', 'pending')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_postback_receipts_user_time
  ON public.postback_receipts(user_id, created_at DESC);

ALTER TABLE public.postback_receipts ENABLE ROW LEVEL SECURITY;

-- No client-facing policy is intentional: only the service-role postback
-- handler and maintenance jobs may read or write provider receipts.
REVOKE ALL ON TABLE public.postback_receipts FROM PUBLIC, anon, authenticated;

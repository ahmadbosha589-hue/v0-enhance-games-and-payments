-- 107: Rewarded-ad event ledger.
--
-- The rewarded-ads S2S callback records every verified provider postback here,
-- keyed by the provider transaction id (txid) for idempotency: replayed
-- postbacks upsert onto the same row. `claimed_at` is set when the user
-- actually converts the minted watch token at /api/bonus-reward/claim, so a
-- late provider retry can never fund a second payout.

CREATE TABLE IF NOT EXISTS public.rewarded_ad_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txid TEXT NOT NULL,
  network TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rewarded_ad_events_txid
  ON public.rewarded_ad_events (txid);
CREATE INDEX IF NOT EXISTS idx_rewarded_ad_events_user
  ON public.rewarded_ad_events (user_id, created_at DESC);

ALTER TABLE public.rewarded_ad_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rewarded_ad_events' AND policyname = 'service_all_rewarded_ad_events'
  ) THEN
    CREATE POLICY service_all_rewarded_ad_events ON public.rewarded_ad_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

REVOKE ALL ON public.rewarded_ad_events FROM anon, authenticated;

-- Prevent one on-chain transaction from being reused for multiple boosters.
CREATE UNIQUE INDEX IF NOT EXISTS idx_booster_purchases_transaction_hash_unique
  ON public.booster_purchases (transaction_hash)
  WHERE transaction_hash IS NOT NULL;

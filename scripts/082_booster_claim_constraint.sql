-- Include the persisted booster component in claim accounting integrity.
ALTER TABLE public.claims
  DROP CONSTRAINT IF EXISTS claims_amount_check;

ALTER TABLE public.claims
  ADD CONSTRAINT claims_amount_check CHECK (
    amount_satoshis = base_amount_satoshis
      + streak_bonus_satoshis
      + booster_bonus_satoshis
      + referral_bonus_satoshis
  );

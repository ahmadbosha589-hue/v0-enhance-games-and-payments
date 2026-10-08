-- 072_add_ad_ad_completions.sql
--
-- Backing table for the AdsGram rewarded-ad completion endpoint
-- (app/api/ads/adsgram-reward/route.ts).
--
-- The unique index on (user_id, block_id, cooldown_bucket) makes the
-- one-reward-per-cooldown rule race-proof at the database level rather than
-- trusting a check-then-insert in the route.

CREATE TABLE IF NOT EXISTS public.ad_ad_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ad_network TEXT NOT NULL DEFAULT 'adsgram',
  block_id TEXT NOT NULL,
  cooldown_bucket BIGINT NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  metadata JSONB DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_ad_completions_cooldown
  ON public.ad_ad_completions(user_id, block_id, cooldown_bucket);

CREATE INDEX IF NOT EXISTS idx_ad_ad_completions_user
  ON public.ad_ad_completions(user_id, completed_at DESC);

ALTER TABLE public.ad_ad_completions ENABLE ROW LEVEL SECURITY;

-- Users can see their own completions; writes go through the service role.
CREATE POLICY "Users can view own ad completions" ON public.ad_ad_completions
  FOR SELECT USING (auth.uid() = user_id);

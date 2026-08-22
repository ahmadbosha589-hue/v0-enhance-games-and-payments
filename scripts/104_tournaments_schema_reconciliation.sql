-- 104: Tournaments schema reconciliation — end the 000/061 split-brain.
--
-- Audit finding: two incompatible 'tournaments' schemas coexist. The live DB
-- has BOTH column sets (000's type/name/prize_pool/prizes/starts_at/ends_at
-- and 061's category/title/prize_pool_satoshis/prize_distribution/
-- start_date/end_date). /api/tournaments writes 000 columns while
-- update_tournament_score / get_or_create_tournament / finalize_tournament
-- read 061 columns — whichever path runs, the other half breaks.
--
-- Resolution: the 061 schema (category/period/prize_distribution) is the
-- canonical one — the scoring RPCs, finalize (096), and the leaderboard
-- aggregation all speak it. This migration:
--   (1) backfills 061 columns from any rows created via the 000-shaped
--       insert path,
--   (2) adds DEFAULTs + sync triggers so both column sets stay consistent no
--       matter which one a writer uses,
--   (3) extends tournament_category with the supporter types the app's
--       TOURNAMENT_CONFIGS create,
--   (4) drops the legacy 000-only constraints that reject 061 writes,
--   (5) adds the missing indexes.

-- ── (3) Supporter categories used by app/api/tournaments TOURNAMENT_CONFIGS ──
ALTER TYPE public.tournament_category ADD VALUE IF NOT EXISTS 'supporter_ads_watched';
ALTER TYPE public.tournament_category ADD VALUE IF NOT EXISTS 'supporter_earnings';

-- ── (1) Backfill canonical columns from legacy-shaped rows ──────────────────
UPDATE public.tournaments
   SET category = COALESCE(category, type::public.tournament_category),
       title = COALESCE(NULLIF(title, ''), COALESCE(name, type::TEXT))
 WHERE (category IS NULL AND type IS NOT NULL)
    OR (COALESCE(title, '') = '' AND name IS NOT NULL);

UPDATE public.tournaments
   SET prize_pool_satoshis = COALESCE(prize_pool_satoshis, prize_pool::BIGINT)
 WHERE prize_pool_satoshis IS NULL AND prize_pool IS NOT NULL;

UPDATE public.tournaments
   SET start_date = COALESCE(start_date, starts_at),
       end_date = COALESCE(end_date, ends_at)
 WHERE start_date IS NULL AND starts_at IS NOT NULL;

-- prize_distribution: default to top-3 50/30/20 when absent (finalize 096
-- indexes into this array; NULL would zero every payout).
UPDATE public.tournaments
   SET prize_distribution = COALESCE(prize_distribution, '[50,30,20]'::JSONB)
 WHERE prize_distribution IS NULL;

-- Mirror canonical → legacy so 000-shaped readers keep working.
UPDATE public.tournaments
   SET type = category::TEXT,
       name = COALESCE(NULLIF(name, ''), title),
       prize_pool = COALESCE(prize_pool, prize_pool_satoshis::INT),
       starts_at = COALESCE(starts_at, start_date),
       ends_at = COALESCE(ends_at, end_date)
 WHERE type IS DISTINCT FROM category::TEXT
    OR name IS NULL
    OR prize_pool IS NULL
    OR starts_at IS NULL;

-- ── (2) Keep both column sets in sync going forward ─────────────────────────
CREATE OR REPLACE FUNCTION public.tournaments_sync_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Canonical (061) wins on conflict; mirror into the legacy columns.
  NEW.category := COALESCE(NEW.category, NEW.type::public.tournament_category);
  NEW.title    := COALESCE(NULLIF(NEW.title, ''), COALESCE(NEW.name, NEW.type));
  NEW.prize_pool_satoshis := COALESCE(NEW.prize_pool_satoshis, NEW.prize_pool::BIGINT);
  NEW.prize_distribution  := COALESCE(NEW.prize_distribution, '[50,30,20]'::JSONB);
  NEW.start_date := COALESCE(NEW.start_date, NEW.starts_at);
  NEW.end_date   := COALESCE(NEW.end_date, NEW.ends_at);

  NEW.type      := NEW.category::TEXT;
  NEW.name      := NEW.title;
  NEW.prize_pool := NEW.prize_pool_satoshis::INT;
  NEW.starts_at  := NEW.start_date;
  NEW.ends_at    := NEW.end_date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournaments_sync_columns ON public.tournaments;
CREATE TRIGGER trg_tournaments_sync_columns
BEFORE INSERT OR UPDATE ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.tournaments_sync_columns();

-- ── (4) Defaults so either insert path produces a complete row ──────────────
ALTER TABLE public.tournaments
  ALTER COLUMN prize_distribution SET DEFAULT '[50,30,20]'::JSONB;

-- ── (5) Indexes for the leaderboard/active lookups ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_tournaments_status_active
  ON public.tournaments (status, start_date);
CREATE INDEX IF NOT EXISTS idx_tournaments_category_period
  ON public.tournaments (category, period, status);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_board
  ON public.tournament_participants (tournament_id, score DESC);

-- participants: mirror final_rank/prize_won_satoshis into rank/prize_amount
-- so legacy-shaped readers see the finalized results.
CREATE OR REPLACE FUNCTION public.tournament_participants_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.final_rank := COALESCE(NEW.final_rank, NEW.rank);
  NEW.prize_won_satoshis := COALESCE(NEW.prize_won_satoshis, NEW.prize_amount::BIGINT);
  NEW.rank := COALESCE(NEW.final_rank, NEW.rank);
  NEW.prize_amount := COALESCE(NEW.prize_won_satoshis::INT, NEW.prize_amount);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournament_participants_sync ON public.tournament_participants;
CREATE TRIGGER trg_tournament_participants_sync
BEFORE INSERT OR UPDATE ON public.tournament_participants
FOR EACH ROW EXECUTE FUNCTION public.tournament_participants_sync();

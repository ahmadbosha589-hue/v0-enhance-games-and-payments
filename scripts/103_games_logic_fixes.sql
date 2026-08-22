-- 103: Games logic fixes (from launch-readiness game audit).
--
-- (1) game_sessions.status CHECK forbids 'lost' but complete_game_reward
--     (089:88, 084:330) writes status='lost' on non-wins. Every losing game
--     completion raised check_violation inside the SECURITY DEFINER RPC and
--     rolled the whole transaction back — losses were never recorded and the
--     route returned a bogus 503.
-- (2) game_sessions RLS allowed users to UPDATE/INSERT their own session rows,
--     letting anyone poison global high-score leaderboards (payouts were never
--     at risk — they flow only through the service-role RPC).

-- ── (1) Allow the 'lost' status the reward RPC writes ────────────────────────
ALTER TABLE public.game_sessions DROP CONSTRAINT IF EXISTS game_sessions_status_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.game_sessions'::regclass
      AND conname = 'game_sessions_status_check'
  ) THEN
    ALTER TABLE public.game_sessions
      ADD CONSTRAINT game_sessions_status_check
      CHECK (status IN ('in_progress','completed','failed','expired','lost'));
  END IF;
END $$;

-- Backfill any sessions that failed to record their loss during the broken
-- window: in_progress sessions older than 1 day are dead by definition.
UPDATE public.game_sessions
   SET status = 'expired'
 WHERE status = 'in_progress'
   AND started_at < NOW() - INTERVAL '1 day';

-- ── (2) Close the leaderboard-poisoning hole ─────────────────────────────────
DROP POLICY IF EXISTS "game_sessions_update_own" ON public.game_sessions;
DROP POLICY IF EXISTS "game_sessions_insert_own" ON public.game_sessions;
DROP POLICY IF EXISTS "Users can update own game sessions" ON public.game_sessions;
DROP POLICY IF EXISTS "Users can insert own game sessions" ON public.game_sessions;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.game_sessions FROM anon, authenticated;
GRANT SELECT ON public.game_sessions TO authenticated;

-- ── (3) Dead SQL surface with no application callers (audit-confirmed):
--        set_game_cooldown / can_play_game / can_play_game_type duplicate
--        logic that lives in the routes; keeping them is extra SECURITY
--        DEFINER surface that had to be repeatedly re-ACL'd.
DROP FUNCTION IF EXISTS public.set_game_cooldown(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.can_play_game(UUID, TEXT);
DROP FUNCTION IF EXISTS public.can_play_game_type(UUID, TEXT);

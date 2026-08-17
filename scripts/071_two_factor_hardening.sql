-- ============================================================================
-- 071 — 2FA hardening: cross-instance attempt limiting + TOTP replay guard
--
-- Fixes (S6):
--   * /api/2fa/validate accepted `userId` from the request body with no auth
--     and no rate limit  ->  an unlimited 6-digit brute-force oracle.
--   * A valid TOTP could be replayed for its whole +/-30s window.
--   * /api/2fa/status called auth.admin.listUsers() (loads EVERY user) on
--     every login attempt just to answer "does this email have 2FA?".
--
-- Attempt state lives in Postgres rather than process memory because Vercel
-- runs many isolated instances: an in-process Map is per-instance and resets on
-- every cold start, which is indistinguishable from having no limiter.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Replay guard column
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS two_factor_last_step BIGINT;

COMMENT ON COLUMN public.profiles.two_factor_last_step IS
  'Highest accepted TOTP time-step counter. A submitted step <= this value is a replay and is rejected (see app/api/2fa/validate).';

-- ---------------------------------------------------------------------------
-- Attempt ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.two_factor_attempts (
  user_id       UUID        NOT NULL,
  ip            TEXT        NOT NULL,
  attempts      INTEGER     NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ip)
);

CREATE INDEX IF NOT EXISTS idx_2fa_attempts_updated
  ON public.two_factor_attempts (updated_at);

ALTER TABLE public.two_factor_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only. Clients must never read or write this ledger.

-- ---------------------------------------------------------------------------
-- consume_2fa_attempt — returns TRUE when the caller may proceed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_2fa_attempt(
  p_user_id        UUID,
  p_ip             TEXT,
  p_max_attempts   INTEGER DEFAULT 5,
  p_window_seconds INTEGER DEFAULT 900
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     two_factor_attempts;
  v_now     TIMESTAMPTZ := NOW();
  v_window  INTERVAL    := make_interval(secs => GREATEST(p_window_seconds, 1));
BEGIN
  -- Row lock serializes concurrent attempts for the same (user, ip), so a
  -- burst of parallel requests cannot each read the same pre-increment count.
  SELECT * INTO v_row
    FROM two_factor_attempts
   WHERE user_id = p_user_id AND ip = p_ip
     FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO two_factor_attempts (user_id, ip, attempts, window_start, updated_at)
    VALUES (p_user_id, p_ip, 1, v_now, v_now);
    RETURN TRUE;
  END IF;

  -- Still locked out?
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    RETURN FALSE;
  END IF;

  -- Window expired (or lockout elapsed) -> start a fresh window.
  IF v_row.window_start + v_window <= v_now
     OR (v_row.locked_until IS NOT NULL AND v_row.locked_until <= v_now) THEN
    UPDATE two_factor_attempts
       SET attempts = 1, window_start = v_now, locked_until = NULL, updated_at = v_now
     WHERE user_id = p_user_id AND ip = p_ip;
    RETURN TRUE;
  END IF;

  -- Budget exhausted -> lock for the remainder of the window.
  IF v_row.attempts + 1 > p_max_attempts THEN
    UPDATE two_factor_attempts
       SET attempts     = v_row.attempts + 1,
           locked_until = v_now + v_window,
           updated_at   = v_now
     WHERE user_id = p_user_id AND ip = p_ip;
    RETURN FALSE;
  END IF;

  UPDATE two_factor_attempts
     SET attempts = v_row.attempts + 1, updated_at = v_now
   WHERE user_id = p_user_id AND ip = p_ip;
  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION public.consume_2fa_attempt(UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- reset_2fa_attempts — clear the counter after a successful validation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_2fa_attempts(
  p_user_id UUID,
  p_ip      TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM two_factor_attempts WHERE user_id = p_user_id AND ip = p_ip;
$$;

REVOKE ALL ON FUNCTION public.reset_2fa_attempts(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- email_requires_2fa — replaces the listUsers() scan on the login path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_requires_2fa(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT COALESCE(
    (SELECT p.two_factor_enabled
       FROM auth.users u
       JOIN public.profiles p ON p.id = u.id
      WHERE LOWER(u.email) = LOWER(p_email)
      LIMIT 1),
    FALSE)
$$;

REVOKE ALL ON FUNCTION public.email_requires_2fa(TEXT)
  FROM PUBLIC, anon, authenticated;

-- Supports the lookup above. auth.users.email is citext-ish in practice but the
-- explicit lower() index guarantees the plan is an index scan, not a seq scan
-- over every user on every login attempt.
CREATE INDEX IF NOT EXISTS idx_auth_users_email_lower
  ON auth.users (LOWER(email));

-- ---------------------------------------------------------------------------
-- Housekeeping: drop stale ledger rows (called from the cleanup cron)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_2fa_attempts(p_older_than_hours INTEGER DEFAULT 48)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM two_factor_attempts
   WHERE updated_at < NOW() - make_interval(hours => GREATEST(p_older_than_hours, 1));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;

REVOKE ALL ON FUNCTION public.prune_2fa_attempts(INTEGER)
  FROM PUBLIC, anon, authenticated;

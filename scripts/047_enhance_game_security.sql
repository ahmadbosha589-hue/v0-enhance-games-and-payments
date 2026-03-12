-- Complete game system setup with enhanced security and per-game cooldowns
-- This creates all necessary tables and adds multi-account protection

-- ========================================
-- 1. CREATE GAME_SESSIONS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  reward_satoshis INTEGER NOT NULL DEFAULT 3,
  session_token TEXT NOT NULL UNIQUE,
  verification_data JSONB,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'expired')),
  game_duration_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  fingerprint_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON public.game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_created ON public.game_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_token ON public.game_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_game_sessions_fingerprint ON public.game_sessions(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_game_sessions_ip_created ON public.game_sessions(ip_address, created_at DESC);

-- Enable RLS
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "game_sessions_select_own" ON public.game_sessions;
CREATE POLICY "game_sessions_select_own" ON public.game_sessions 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_sessions_insert_own" ON public.game_sessions;
CREATE POLICY "game_sessions_insert_own" ON public.game_sessions 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_sessions_update_own" ON public.game_sessions;
CREATE POLICY "game_sessions_update_own" ON public.game_sessions 
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_sessions_service_all" ON public.game_sessions;
CREATE POLICY "game_sessions_service_all" ON public.game_sessions
  FOR ALL 
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ========================================
-- 2. CREATE GAME_DAILY_LIMITS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.game_daily_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  games_played INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  last_game_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_game_daily_limits_user_date ON public.game_daily_limits(user_id, date);

-- Enable RLS
ALTER TABLE public.game_daily_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "game_daily_limits_select_own" ON public.game_daily_limits;
CREATE POLICY "game_daily_limits_select_own" ON public.game_daily_limits 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_daily_limits_insert_own" ON public.game_daily_limits;
CREATE POLICY "game_daily_limits_insert_own" ON public.game_daily_limits 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_daily_limits_update_own" ON public.game_daily_limits;
CREATE POLICY "game_daily_limits_update_own" ON public.game_daily_limits 
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_daily_limits_service_all" ON public.game_daily_limits;
CREATE POLICY "game_daily_limits_service_all" ON public.game_daily_limits
  FOR ALL 
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ========================================
-- 3. CREATE GAME_COOLDOWNS TABLE (Per-Game Type)
-- ========================================
CREATE TABLE IF NOT EXISTS public.game_cooldowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  cooldown_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, game_type)
);

-- Create index for fast cooldown lookups
CREATE INDEX IF NOT EXISTS idx_game_cooldowns_user_type ON public.game_cooldowns(user_id, game_type);
CREATE INDEX IF NOT EXISTS idx_game_cooldowns_until ON public.game_cooldowns(cooldown_until);

-- Enable RLS
ALTER TABLE public.game_cooldowns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for game_cooldowns
DROP POLICY IF EXISTS "game_cooldowns_select_own" ON public.game_cooldowns;
CREATE POLICY "game_cooldowns_select_own" ON public.game_cooldowns 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_cooldowns_insert_own" ON public.game_cooldowns;
CREATE POLICY "game_cooldowns_insert_own" ON public.game_cooldowns 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_cooldowns_update_own" ON public.game_cooldowns;
CREATE POLICY "game_cooldowns_update_own" ON public.game_cooldowns 
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "game_cooldowns_service_all" ON public.game_cooldowns;
CREATE POLICY "game_cooldowns_service_all" ON public.game_cooldowns
  FOR ALL 
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ========================================
-- 4. HELPER FUNCTIONS
-- ========================================

-- Function to set cooldown for a specific game type after playing
CREATE OR REPLACE FUNCTION public.set_game_cooldown(
  p_user_id UUID,
  p_game_type TEXT,
  p_cooldown_minutes INTEGER DEFAULT 5
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO game_cooldowns (user_id, game_type, cooldown_until)
  VALUES (p_user_id, p_game_type, NOW() + (p_cooldown_minutes || ' minutes')::INTERVAL)
  ON CONFLICT (user_id, game_type) DO UPDATE SET
    cooldown_until = NOW() + (p_cooldown_minutes || ' minutes')::INTERVAL,
    updated_at = NOW();
END;
$$;

-- Function to check if user can play a specific game type
CREATE OR REPLACE FUNCTION public.can_play_game_type(
  p_user_id UUID,
  p_game_type TEXT
)
RETURNS TABLE (
  can_play BOOLEAN,
  seconds_until_next INTEGER,
  cooldown_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cooldown_until TIMESTAMPTZ;
BEGIN
  -- Get cooldown for this specific game type
  SELECT gc.cooldown_until INTO v_cooldown_until
  FROM game_cooldowns gc
  WHERE gc.user_id = p_user_id AND gc.game_type = p_game_type;

  -- If no cooldown record or cooldown has passed
  IF v_cooldown_until IS NULL OR v_cooldown_until <= NOW() THEN
    RETURN QUERY SELECT TRUE::BOOLEAN, 0::INTEGER, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Still in cooldown
  RETURN QUERY SELECT 
    FALSE::BOOLEAN,
    EXTRACT(EPOCH FROM (v_cooldown_until - NOW()))::INTEGER,
    v_cooldown_until;
END;
$$;

-- Function to check if user can play any game (daily limit check)
CREATE OR REPLACE FUNCTION public.can_play_game(p_user_id UUID)
RETURNS TABLE (
  can_play BOOLEAN,
  seconds_until_next INTEGER,
  games_remaining INTEGER,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_games_today INTEGER;
  v_daily_limit INTEGER := 20; -- 20 games per day
BEGIN
  -- Get today's stats
  SELECT games_played INTO v_games_today
  FROM game_daily_limits
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  -- Default values if no record
  v_games_today := COALESCE(v_games_today, 0);

  -- Check daily limit
  IF v_games_today >= v_daily_limit THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN,
      0::INTEGER,
      0::INTEGER,
      'Daily limit reached (20 games per day)'::TEXT;
    RETURN;
  END IF;

  -- Can play (per-game cooldowns are handled separately)
  RETURN QUERY SELECT 
    TRUE::BOOLEAN,
    0::INTEGER,
    (v_daily_limit - v_games_today)::INTEGER,
    'Ready to play'::TEXT;
END;
$$;

-- Add fingerprint_hash column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'game_sessions') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'game_sessions' AND column_name = 'fingerprint_hash') THEN
      ALTER TABLE public.game_sessions ADD COLUMN fingerprint_hash TEXT;
    END IF;
  END IF;
END $$;

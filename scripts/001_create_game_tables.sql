-- Create game_sessions table to track game plays and rewards
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL CHECK (game_type IN ('tetris', 'block_blast', 'car_racing')),
  score INTEGER NOT NULL DEFAULT 0,
  reward_satoshis INTEGER NOT NULL DEFAULT 3,
  session_token TEXT NOT NULL UNIQUE,
  verification_data JSONB,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'expired')),
  game_duration_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON public.game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_created ON public.game_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_token ON public.game_sessions(session_token);

-- Enable RLS
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "game_sessions_select_own" ON public.game_sessions 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "game_sessions_insert_own" ON public.game_sessions 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "game_sessions_update_own" ON public.game_sessions 
  FOR UPDATE USING (auth.uid() = user_id);

-- Create game_daily_limits table to track daily game limits
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
CREATE POLICY "game_daily_limits_select_own" ON public.game_daily_limits 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "game_daily_limits_insert_own" ON public.game_daily_limits 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "game_daily_limits_update_own" ON public.game_daily_limits 
  FOR UPDATE USING (auth.uid() = user_id);

-- Function to check if user can play a game
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
  v_last_game TIMESTAMPTZ;
  v_games_today INTEGER;
  v_cooldown_seconds INTEGER := 180; -- 3 minutes
  v_daily_limit INTEGER := 25;
  v_seconds_since_last INTEGER;
BEGIN
  -- Get today's stats
  SELECT games_played, last_game_at INTO v_games_today, v_last_game
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
      'Daily limit reached (25 games per day)'::TEXT;
    RETURN;
  END IF;

  -- Check cooldown
  IF v_last_game IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_game))::INTEGER;
    IF v_seconds_since_last < v_cooldown_seconds THEN
      RETURN QUERY SELECT 
        FALSE::BOOLEAN,
        (v_cooldown_seconds - v_seconds_since_last)::INTEGER,
        (v_daily_limit - v_games_today)::INTEGER,
        'Please wait before playing again'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Can play
  RETURN QUERY SELECT 
    TRUE::BOOLEAN,
    0::INTEGER,
    (v_daily_limit - v_games_today)::INTEGER,
    'Ready to play'::TEXT;
END;
$$;

-- Function to start a game session
CREATE OR REPLACE FUNCTION public.start_game_session(
  p_user_id UUID,
  p_game_type TEXT,
  p_session_token TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_device_fingerprint TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  session_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_play BOOLEAN;
  v_reason TEXT;
  v_session_id UUID;
BEGIN
  -- Check if can play
  SELECT cp.can_play, cp.reason INTO v_can_play, v_reason
  FROM can_play_game(p_user_id) cp;

  IF NOT v_can_play THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, v_reason::TEXT;
    RETURN;
  END IF;

  -- Create session
  INSERT INTO game_sessions (user_id, game_type, session_token, ip_address, device_fingerprint)
  VALUES (p_user_id, p_game_type, p_session_token, p_ip_address, p_device_fingerprint)
  RETURNING id INTO v_session_id;

  RETURN QUERY SELECT TRUE::BOOLEAN, v_session_id, 'Game started'::TEXT;
END;
$$;

-- Function to complete a game and award satoshis
CREATE OR REPLACE FUNCTION public.complete_game_session(
  p_user_id UUID,
  p_session_token TEXT,
  p_score INTEGER,
  p_game_state_hash TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  reward INTEGER,
  new_balance INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_reward INTEGER := 3; -- 3 satoshis per game
  v_new_balance INTEGER;
  v_min_game_duration INTEGER := 30; -- Minimum 30 seconds to complete
  v_game_duration INTEGER;
BEGIN
  -- Get and lock the session
  SELECT * INTO v_session
  FROM game_sessions
  WHERE session_token = p_session_token AND user_id = p_user_id AND completed_at IS NULL
  FOR UPDATE;

  IF v_session IS NULL THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, 0::INTEGER, 0::INTEGER, 'Invalid or already completed session'::TEXT;
    RETURN;
  END IF;

  -- Calculate game duration
  v_game_duration := EXTRACT(EPOCH FROM (NOW() - v_session.started_at))::INTEGER;

  -- Validate game duration (anti-bot check)
  IF v_game_duration < v_min_game_duration THEN
    UPDATE game_sessions SET is_valid = FALSE, fraud_score = 100
    WHERE id = v_session.id;
    RETURN QUERY SELECT FALSE::BOOLEAN, 0::INTEGER, 0::INTEGER, 'Game completed too quickly - suspicious activity'::TEXT;
    RETURN;
  END IF;

  -- Mark session complete
  UPDATE game_sessions 
  SET completed_at = NOW(), score = p_score, game_state_hash = p_game_state_hash, reward_satoshis = v_reward
  WHERE id = v_session.id;

  -- Update daily limits
  INSERT INTO game_daily_limits (user_id, date, games_played, total_earned, last_game_at)
  VALUES (p_user_id, CURRENT_DATE, 1, v_reward, NOW())
  ON CONFLICT (user_id, date) DO UPDATE SET
    games_played = game_daily_limits.games_played + 1,
    total_earned = game_daily_limits.total_earned + v_reward,
    last_game_at = NOW(),
    updated_at = NOW();

  -- Add to user balance
  UPDATE profiles 
  SET balance_satoshis = balance_satoshis + v_reward,
      total_earned_satoshis = total_earned_satoshis + v_reward
  WHERE id = p_user_id
  RETURNING balance_satoshis INTO v_new_balance;

  -- Create transaction record if table exists
  BEGIN
    INSERT INTO transactions (user_id, type, status, amount_satoshis, balance_before, balance_after, description)
    VALUES (p_user_id, 'bonus', 'completed', v_reward, v_new_balance - v_reward, v_new_balance, 'Game reward: ' || v_session.game_type);
  EXCEPTION WHEN undefined_table THEN
    -- transactions table doesn't exist, skip
  END;

  RETURN QUERY SELECT TRUE::BOOLEAN, v_reward::INTEGER, v_new_balance::INTEGER, 'Game completed! Earned ' || v_reward || ' satoshis'::TEXT;
END;
$$;

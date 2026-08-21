-- 089: Prevent concurrent same-game sessions from bypassing win cooldowns.

DELETE FROM public.game_sessions
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, game_type
             ORDER BY created_at ASC, id ASC
           ) AS row_number
    FROM public.game_sessions
    WHERE status = 'in_progress'
  ) ranked
  WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_sessions_one_in_progress_per_type
  ON public.game_sessions (user_id, game_type)
  WHERE status = 'in_progress';

CREATE OR REPLACE FUNCTION public.complete_game_reward(
  p_user_id UUID,
  p_session_id UUID,
  p_score INTEGER,
  p_game_type TEXT,
  p_is_winner BOOLEAN,
  p_reward_satoshis INTEGER,
  p_game_duration_ms INTEGER,
  p_cooldown_until TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.game_sessions%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_daily public.game_daily_limits%ROWTYPE;
  v_before BIGINT;
  v_after BIGINT;
  v_games_today INTEGER;
  v_total_earned INTEGER;
  v_tx_id UUID;
  v_existing_cooldown TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id AND user_id = p_user_id AND session_token IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'in_progress' OR v_session.game_type <> p_game_type THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_SESSION', 'message', 'Invalid or already completed game session');
  END IF;

  IF p_is_winner THEN
    SELECT cooldown_until INTO v_existing_cooldown
    FROM public.game_cooldowns
    WHERE user_id = p_user_id AND game_type = p_game_type
    FOR UPDATE;

    IF v_existing_cooldown IS NOT NULL AND v_existing_cooldown > NOW() THEN
      UPDATE public.game_sessions
      SET status = 'expired', completed_at = NOW(), score = p_score, game_duration_ms = p_game_duration_ms
      WHERE id = p_session_id;
      RETURN jsonb_build_object('success', false, 'error', 'COOLDOWN_ACTIVE', 'message', 'Game cooldown is active');
    END IF;
  END IF;

  SELECT * INTO v_daily
  FROM public.game_daily_limits
  WHERE user_id = p_user_id AND date = (NOW() AT TIME ZONE 'UTC')::DATE
  FOR UPDATE;

  v_games_today := COALESCE(v_daily.games_played, 0);
  v_total_earned := COALESCE(v_daily.total_earned, 0);
  IF v_games_today >= 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'DAILY_LIMIT', 'message', 'Daily game limit reached');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_RESTRICTED', 'message', 'Account is not active');
  END IF;

  UPDATE public.game_sessions
  SET score = p_score,
      status = CASE WHEN p_is_winner THEN 'completed' ELSE 'lost' END,
      reward_satoshis = CASE WHEN p_is_winner THEN p_reward_satoshis ELSE 0 END,
      game_duration_ms = p_game_duration_ms,
      completed_at = NOW()
  WHERE id = p_session_id AND status = 'in_progress';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_COMPLETED', 'message', 'Game session already finalized');
  END IF;

  v_games_today := v_games_today + 1;
  IF p_is_winner THEN v_total_earned := v_total_earned + p_reward_satoshis; END IF;

  INSERT INTO public.game_daily_limits (user_id, date, games_played, total_earned, last_game_at, updated_at)
  VALUES (p_user_id, (NOW() AT TIME ZONE 'UTC')::DATE, v_games_today, v_total_earned, NOW(), NOW())
  ON CONFLICT (user_id, date) DO UPDATE SET
    games_played = EXCLUDED.games_played,
    total_earned = EXCLUDED.total_earned,
    last_game_at = EXCLUDED.last_game_at,
    updated_at = NOW();

  IF p_is_winner THEN
    INSERT INTO public.game_cooldowns (user_id, game_type, cooldown_until, updated_at)
    VALUES (p_user_id, p_game_type, COALESCE(p_cooldown_until, NOW() + INTERVAL '3 minutes'), NOW())
    ON CONFLICT (user_id, game_type) DO UPDATE SET
      cooldown_until = EXCLUDED.cooldown_until,
      updated_at = NOW();

    v_before := COALESCE(v_profile.balance_satoshis, 0);
    v_after := v_before + p_reward_satoshis;
    UPDATE public.profiles
    SET balance_satoshis = v_after,
        total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + p_reward_satoshis,
        updated_at = NOW()
    WHERE id = p_user_id;

    INSERT INTO public.transactions (
      user_id, type, status, amount_satoshis, balance_before, balance_after,
      description, metadata, completed_at
    ) VALUES (
      p_user_id, 'game', 'completed', p_reward_satoshis, v_before, v_after,
      'Game reward', jsonb_build_object('game_id', p_session_id, 'game_type', p_game_type, 'score', p_score), NOW()
    ) RETURNING id INTO v_tx_id;
  ELSE
    v_after := COALESCE(v_profile.balance_satoshis, 0);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_winner', p_is_winner,
    'reward', CASE WHEN p_is_winner THEN p_reward_satoshis ELSE 0 END,
    'new_balance', v_after,
    'games_played_today', v_games_today,
    'total_earned_today', v_total_earned,
    'transaction_id', v_tx_id,
    'cooldown_until', CASE WHEN p_is_winner THEN COALESCE(p_cooldown_until, NOW() + INTERVAL '3 minutes') ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_game_reward(UUID, UUID, INTEGER, TEXT, BOOLEAN, INTEGER, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_game_reward(UUID, UUID, INTEGER, TEXT, BOOLEAN, INTEGER, INTEGER, TIMESTAMPTZ) TO service_role;

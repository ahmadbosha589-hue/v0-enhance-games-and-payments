-- Function to safely add game rewards to user balance
CREATE OR REPLACE FUNCTION add_game_reward(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET 
    balance_satoshis = COALESCE(balance_satoshis, 0) + p_amount,
    total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + p_amount,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION add_game_reward(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION add_game_reward(UUID, INTEGER) TO service_role;

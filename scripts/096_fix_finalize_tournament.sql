-- 096: Tournament payouts — make finalize_tournament actually pay winners.
--
-- Audit found finalize_tournament had zero callers and the admin "end" action
-- marked tournaments completed without distributing advertised prize pools.
-- The 061 version pays but returns VOID, has no idempotency (re-running
-- double-pays), no advisory lock (concurrent double-pay), and writes no
-- ledger rows. This replacement keeps the same name and payout math
-- (percentage-array prize_distribution) while fixing all four issues.

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'tournament_prize';

CREATE OR REPLACE FUNCTION public.finalize_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament public.tournaments%ROWTYPE;
  v_participant RECORD;
  v_rank INT := 0;
  v_prize_pct NUMERIC;
  v_prize BIGINT;
  v_total_distributed BIGINT := 0;
  v_winners_paid INT := 0;
  v_results JSONB := '[]'::JSONB;
  v_tx_id UUID;
BEGIN
  -- Serialize finalization per tournament.
  IF NOT pg_try_advisory_xact_lock(
    ('x' || substr(md5('tournament:' || p_tournament_id::TEXT), 1, 15))::bit(60)::BIGINT
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FINALIZATION_IN_PROGRESS');
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TOURNAMENT_NOT_FOUND');
  END IF;

  IF v_tournament.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true,
      'winners_paid', 0, 'total_distributed', 0);
  END IF;

  FOR v_participant IN
    SELECT tp.*, p.balance_satoshis AS p_balance
    FROM public.tournament_participants tp
    JOIN public.profiles p ON p.id = tp.user_id
    WHERE tp.tournament_id = p_tournament_id
    ORDER BY tp.score DESC
  LOOP
    v_rank := v_rank + 1;

    v_prize := 0;
    IF v_rank <= 10 AND v_tournament.prize_pool_satoshis > 0 THEN
      BEGIN
        v_prize_pct := (v_tournament.prize_distribution -> (v_rank - 1))::NUMERIC;
        v_prize := FLOOR(v_tournament.prize_pool_satoshis * v_prize_pct / 100)::BIGINT;
      EXCEPTION WHEN OTHERS THEN
        v_prize := 0; -- malformed distribution entry: pay nothing for this rank
      END;
    END IF;

    UPDATE public.tournament_participants
       SET final_rank = v_rank,
           prize_won_satoshis = v_prize,
           prize_paid = (v_prize > 0),
           updated_at = NOW()
     WHERE id = v_participant.id;

    CONTINUE WHEN v_prize < 1;

    INSERT INTO public.transactions (
      user_id, type, amount_satoshis, balance_before, balance_after,
      status, description, completed_at
    ) VALUES (
      v_participant.user_id, 'tournament_prize', v_prize,
      v_participant.p_balance, v_participant.p_balance + v_prize,
      'completed',
      'Tournament prize — rank #' || v_rank,
      NOW()
    ) RETURNING id INTO v_tx_id;

    UPDATE public.profiles
       SET balance_satoshis = COALESCE(balance_satoshis, 0) + v_prize,
           total_earned_satoshis = COALESCE(total_earned_satoshis, 0) + v_prize,
           updated_at = NOW()
     WHERE id = v_participant.user_id;

    v_total_distributed := v_total_distributed + v_prize;
    v_winners_paid := v_winners_paid + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'rank', v_rank, 'user_id', v_participant.user_id,
      'prize_satoshis', v_prize, 'transaction_id', v_tx_id
    ));
  END LOOP;

  UPDATE public.tournaments
     SET status = 'completed',
         completed_at = NOW(),
         updated_at = NOW()
   WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_completed', false,
    'winners_paid', v_winners_paid,
    'total_distributed', v_total_distributed,
    'distribution', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_tournament(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tournament(UUID) TO service_role;

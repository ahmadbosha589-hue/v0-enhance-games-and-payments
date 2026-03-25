-- Tournaments System - Database Schema
-- Tracks daily, weekly, and monthly tournaments with different categories

-- Tournament type enum
DO $$ BEGIN
  CREATE TYPE tournament_period AS ENUM ('daily', 'weekly', 'monthly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tournament_category AS ENUM ('faucet_claims', 'offerwall_earnings', 'highest_earners');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tournament_status AS ENUM ('upcoming', 'active', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Tournaments table
CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tournament details
  period tournament_period NOT NULL,
  category tournament_category NOT NULL,
  status tournament_status DEFAULT 'upcoming' NOT NULL,
  
  -- Time range
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Prize pool (in satoshis)
  prize_pool_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (prize_pool_satoshis >= 0),
  
  -- Prize distribution (percentages for top 10)
  prize_distribution JSONB DEFAULT '[40, 25, 15, 8, 5, 3, 2, 1, 0.5, 0.5]'::JSONB NOT NULL,
  
  -- Metadata
  title TEXT,
  description TEXT,
  min_participants INTEGER DEFAULT 3,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  
  -- Unique constraint for period + category + dates
  CONSTRAINT unique_tournament UNIQUE (period, category, start_date)
);

-- Tournament participants/leaderboard
CREATE TABLE IF NOT EXISTS public.tournament_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Score based on category
  score BIGINT DEFAULT 0 NOT NULL CHECK (score >= 0),
  
  -- Ranking (updated when tournament ends)
  final_rank INTEGER,
  
  -- Prize won (if any)
  prize_won_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (prize_won_satoshis >= 0),
  prize_paid BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- One entry per user per tournament
  CONSTRAINT unique_participant UNIQUE (tournament_id, user_id)
);

-- Indexes
CREATE INDEX idx_tournaments_period ON public.tournaments(period);
CREATE INDEX idx_tournaments_category ON public.tournaments(category);
CREATE INDEX idx_tournaments_status ON public.tournaments(status);
CREATE INDEX idx_tournaments_dates ON public.tournaments(start_date, end_date);
CREATE INDEX idx_tournaments_active ON public.tournaments(status) WHERE status = 'active';

CREATE INDEX idx_tournament_participants_tournament ON public.tournament_participants(tournament_id);
CREATE INDEX idx_tournament_participants_user ON public.tournament_participants(user_id);
CREATE INDEX idx_tournament_participants_score ON public.tournament_participants(tournament_id, score DESC);
CREATE INDEX idx_tournament_participants_rank ON public.tournament_participants(tournament_id, final_rank) WHERE final_rank IS NOT NULL;

-- Enable RLS
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tournaments

-- Everyone can view tournaments
CREATE POLICY "tournaments_select_all" ON public.tournaments
  FOR SELECT USING (true);

-- Only admins can manage tournaments
CREATE POLICY "tournaments_admin_all" ON public.tournaments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );

-- RLS Policies for tournament_participants

-- Everyone can view leaderboards
CREATE POLICY "tournament_participants_select_all" ON public.tournament_participants
  FOR SELECT USING (true);

-- Users can join tournaments (insert own record)
CREATE POLICY "tournament_participants_insert_own" ON public.tournament_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- System/admins can update scores
CREATE POLICY "tournament_participants_update_system" ON public.tournament_participants
  FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );

-- Grants
GRANT SELECT ON public.tournaments TO authenticated;
GRANT SELECT ON public.tournament_participants TO authenticated;
GRANT INSERT, UPDATE ON public.tournament_participants TO authenticated;
GRANT ALL ON public.tournaments TO service_role;
GRANT ALL ON public.tournament_participants TO service_role;

-- Function to get or create current tournament
CREATE OR REPLACE FUNCTION get_or_create_tournament(
  p_period tournament_period,
  p_category tournament_category
)
RETURNS UUID AS $$
DECLARE
  v_tournament_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_title TEXT;
BEGIN
  -- Calculate dates based on period
  CASE p_period
    WHEN 'daily' THEN
      v_start_date := CURRENT_DATE;
      v_end_date := CURRENT_DATE;
    WHEN 'weekly' THEN
      v_start_date := DATE_TRUNC('week', CURRENT_DATE)::DATE;
      v_end_date := (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '6 days')::DATE;
    WHEN 'monthly' THEN
      v_start_date := DATE_TRUNC('month', CURRENT_DATE)::DATE;
      v_end_date := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  END CASE;
  
  -- Generate title
  v_title := INITCAP(p_period::TEXT) || ' ' || 
             CASE p_category
               WHEN 'faucet_claims' THEN 'Faucet Champion'
               WHEN 'offerwall_earnings' THEN 'Offerwall Master'
               WHEN 'highest_earners' THEN 'Top Earner'
             END;
  
  -- Try to get existing tournament
  SELECT id INTO v_tournament_id
  FROM public.tournaments
  WHERE period = p_period
    AND category = p_category
    AND start_date = v_start_date;
  
  -- Create if not exists
  IF v_tournament_id IS NULL THEN
    INSERT INTO public.tournaments (period, category, start_date, end_date, title, status)
    VALUES (p_period, p_category, v_start_date, v_end_date, v_title, 'active')
    RETURNING id INTO v_tournament_id;
  END IF;
  
  RETURN v_tournament_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update tournament scores
CREATE OR REPLACE FUNCTION update_tournament_score(
  p_user_id UUID,
  p_category tournament_category,
  p_period tournament_period,
  p_score_delta BIGINT
)
RETURNS VOID AS $$
DECLARE
  v_tournament_id UUID;
BEGIN
  -- Get or create the tournament
  v_tournament_id := get_or_create_tournament(p_period, p_category);
  
  -- Insert or update participant score
  INSERT INTO public.tournament_participants (tournament_id, user_id, score)
  VALUES (v_tournament_id, p_user_id, p_score_delta)
  ON CONFLICT (tournament_id, user_id)
  DO UPDATE SET 
    score = tournament_participants.score + p_score_delta,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to finalize tournament and distribute prizes
CREATE OR REPLACE FUNCTION finalize_tournament(p_tournament_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tournament RECORD;
  v_participant RECORD;
  v_rank INTEGER := 0;
  v_prize_pct NUMERIC;
  v_prize_amount BIGINT;
BEGIN
  -- Get tournament details
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id;
  
  IF v_tournament.status != 'active' THEN
    RAISE EXCEPTION 'Tournament is not active';
  END IF;
  
  -- Update rankings and prizes
  FOR v_participant IN
    SELECT tp.*, p.balance_satoshis
    FROM public.tournament_participants tp
    JOIN public.profiles p ON p.id = tp.user_id
    WHERE tp.tournament_id = p_tournament_id
    ORDER BY tp.score DESC
  LOOP
    v_rank := v_rank + 1;
    
    -- Get prize percentage for this rank (1-indexed array)
    IF v_rank <= 10 THEN
      v_prize_pct := (v_tournament.prize_distribution->(v_rank - 1))::NUMERIC;
      v_prize_amount := (v_tournament.prize_pool_satoshis * v_prize_pct / 100)::BIGINT;
    ELSE
      v_prize_amount := 0;
    END IF;
    
    -- Update participant with rank and prize
    UPDATE public.tournament_participants
    SET final_rank = v_rank,
        prize_won_satoshis = v_prize_amount,
        updated_at = NOW()
    WHERE id = v_participant.id;
    
    -- Credit prize to user balance
    IF v_prize_amount > 0 THEN
      UPDATE public.profiles
      SET balance_satoshis = balance_satoshis + v_prize_amount,
          total_earned_satoshis = total_earned_satoshis + v_prize_amount
      WHERE id = v_participant.user_id;
      
      -- Mark as paid
      UPDATE public.tournament_participants
      SET prize_paid = TRUE
      WHERE id = v_participant.id;
    END IF;
  END LOOP;
  
  -- Mark tournament as completed
  UPDATE public.tournaments
  SET status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_tournament_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at
CREATE TRIGGER update_tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tournament_participants_updated_at
  BEFORE UPDATE ON public.tournament_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

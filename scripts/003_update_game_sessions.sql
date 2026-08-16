-- Add missing columns if they don't exist
DO $$ 
BEGIN
  -- Add verification_data column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_sessions' AND column_name = 'verification_data') THEN
    ALTER TABLE public.game_sessions ADD COLUMN verification_data JSONB;
  END IF;

  -- Add status column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_sessions' AND column_name = 'status') THEN
    ALTER TABLE public.game_sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress';
  END IF;

  -- Add game_duration_ms column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_sessions' AND column_name = 'game_duration_ms') THEN
    ALTER TABLE public.game_sessions ADD COLUMN game_duration_ms INTEGER;
  END IF;

  -- Add user_agent column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_sessions' AND column_name = 'user_agent') THEN
    ALTER TABLE public.game_sessions ADD COLUMN user_agent TEXT;
  END IF;

  -- Add completed_at column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_sessions' AND column_name = 'completed_at') THEN
    ALTER TABLE public.game_sessions ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add index for status lookups
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON public.game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_status ON public.game_sessions(user_id, status);

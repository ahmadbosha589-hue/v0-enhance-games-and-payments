-- Add views_count to shortlinks if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shortlinks' AND column_name = 'views_count'
  ) THEN
    ALTER TABLE public.shortlinks ADD COLUMN views_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add view_duration_ms to shortlink_views if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shortlink_views' AND column_name = 'view_duration_ms'
  ) THEN
    ALTER TABLE public.shortlink_views ADD COLUMN view_duration_ms INTEGER;
  END IF;
END $$;

-- Add ip_address to shortlink_views if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shortlink_views' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE public.shortlink_views ADD COLUMN ip_address TEXT;
  END IF;
END $$;

-- Add user_agent to shortlink_views if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shortlink_views' AND column_name = 'user_agent'
  ) THEN
    ALTER TABLE public.shortlink_views ADD COLUMN user_agent TEXT;
  END IF;
END $$;

-- Add ip_address to coupon_redemptions if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'coupon_redemptions' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE public.coupon_redemptions ADD COLUMN ip_address TEXT;
  END IF;
END $$;

-- Add user_agent to coupon_redemptions if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'coupon_redemptions' AND column_name = 'user_agent'
  ) THEN
    ALTER TABLE public.coupon_redemptions ADD COLUMN user_agent TEXT;
  END IF;
END $$;

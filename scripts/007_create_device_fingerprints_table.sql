-- Crypto Faucet Platform - Database Schema
-- Script 007: Create device fingerprints table

CREATE TABLE IF NOT EXISTS public.device_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Fingerprint data
  fingerprint_hash TEXT NOT NULL,
  fingerprint_data JSONB NOT NULL DEFAULT '{}',
  
  -- Browser/device info
  user_agent TEXT,
  browser_name TEXT,
  browser_version TEXT,
  os_name TEXT,
  os_version TEXT,
  device_type TEXT,
  screen_resolution TEXT,
  timezone TEXT,
  language TEXT,
  
  -- Trust level
  is_trusted BOOLEAN DEFAULT FALSE NOT NULL,
  trust_score INTEGER DEFAULT 50 NOT NULL CHECK (trust_score >= 0 AND trust_score <= 100),
  
  -- Usage tracking
  first_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  times_seen INTEGER DEFAULT 1 NOT NULL,
  
  -- Constraints
  UNIQUE(user_id, fingerprint_hash)
);

-- Indexes
CREATE INDEX idx_device_fingerprints_user_id ON public.device_fingerprints(user_id);
CREATE INDEX idx_device_fingerprints_hash ON public.device_fingerprints(fingerprint_hash);
CREATE INDEX idx_device_fingerprints_is_trusted ON public.device_fingerprints(is_trusted);

-- Enable RLS
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;

-- Users can view their own devices
CREATE POLICY "device_fingerprints_select_own" ON public.device_fingerprints
  FOR SELECT USING (auth.uid() = user_id);

-- System can insert device fingerprints
CREATE POLICY "device_fingerprints_insert_system" ON public.device_fingerprints
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- System can update device fingerprints
CREATE POLICY "device_fingerprints_update_system" ON public.device_fingerprints
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins can view all device fingerprints
CREATE POLICY "device_fingerprints_admin_select" ON public.device_fingerprints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin', 'moderator')
    )
  );

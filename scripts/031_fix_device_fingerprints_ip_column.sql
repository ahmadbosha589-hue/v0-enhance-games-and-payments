-- Crypto Faucet Platform - Database Fix
-- Script 031: Add missing ip_addresses column to device_fingerprints table

-- Add the ip_addresses column that the auth callback expects
ALTER TABLE public.device_fingerprints 
ADD COLUMN IF NOT EXISTS ip_addresses TEXT[] DEFAULT '{}';

-- Create an index for IP address lookups
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_ip_addresses 
ON public.device_fingerprints USING GIN (ip_addresses);

-- Verify the column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'device_fingerprints' 
    AND column_name = 'ip_addresses'
  ) THEN
    RAISE NOTICE 'SUCCESS: ip_addresses column added to device_fingerprints table';
  ELSE
    RAISE EXCEPTION 'FAILED: ip_addresses column was not added';
  END IF;
END $$;

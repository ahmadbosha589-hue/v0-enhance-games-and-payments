-- Fix manual_faucet_claims table to ensure faucetpay_tx_id column exists
-- This migration adds the column if it doesn't exist and renames if needed

-- Add faucetpay_tx_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'manual_faucet_claims' 
    AND column_name = 'faucetpay_tx_id'
  ) THEN
    -- Check if faucetpay_payout_id exists (wrong column name)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'manual_faucet_claims' 
      AND column_name = 'faucetpay_payout_id'
    ) THEN
      -- Rename the column
      ALTER TABLE manual_faucet_claims RENAME COLUMN faucetpay_payout_id TO faucetpay_tx_id;
    ELSE
      -- Add the column
      ALTER TABLE manual_faucet_claims ADD COLUMN faucetpay_tx_id VARCHAR(255);
    END IF;
  END IF;
END $$;

-- Ensure faucetpay_email and faucetpay_verified columns exist in profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'faucetpay_email'
  ) THEN
    ALTER TABLE profiles ADD COLUMN faucetpay_email VARCHAR(255);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'faucetpay_verified'
  ) THEN
    ALTER TABLE profiles ADD COLUMN faucetpay_verified BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create index on faucetpay_tx_id for faster lookups if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_manual_faucet_tx_id ON manual_faucet_claims(faucetpay_tx_id);

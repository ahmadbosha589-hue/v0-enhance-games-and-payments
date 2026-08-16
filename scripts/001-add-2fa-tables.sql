-- Add 2FA columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[],
ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMPTZ;

-- Create index for 2FA lookups
CREATE INDEX IF NOT EXISTS idx_profiles_two_factor_enabled 
ON profiles(two_factor_enabled) 
WHERE two_factor_enabled = true;

-- Add comment for documentation
COMMENT ON COLUMN profiles.two_factor_secret IS 'Encrypted TOTP secret for 2FA';
COMMENT ON COLUMN profiles.two_factor_backup_codes IS 'Hashed backup codes for 2FA recovery';
COMMENT ON COLUMN profiles.two_factor_enabled_at IS 'Timestamp when 2FA was enabled';
